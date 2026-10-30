import type { Enemy, Point, State } from './simulation';

export const INTERDICTION_CONFIG = {
	cost: 90, radius: 110, lifetime: 30, cooldown: 40, maxRange: 450,
	minArkClearance: 8, minRelativeX: -50, leftBehind: 650,
} as const;
export interface InterdictionField { id: number; world: Point; remaining: number }
export interface Detour { fieldId: number; waypoint: Point; side: -1 | 1 }

export const fieldRelative = function (state: State): Point | undefined {
	const systems = state.systems; const field = systems?.interdiction.field;
	return systems && field ? { x: field.world.x - systems.distanceTraveled, y: field.world.y } : undefined;
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
	const center = fieldRelative(state);
	return center !== undefined && circleHit(from, to, center, INTERDICTION_CONFIG.radius) !== undefined;
};
export const enemyClearance = function (enemy: Pick<Enemy, 'kind'>): number {
	return INTERDICTION_CONFIG.radius + (enemy.kind === 'flagship' ? 38 : enemy.kind === 'armored' ? 23 : 15) + 12;
};
// Encounters enter on their established bearing. A field at the edge of placement
// range can cover that entry point, so begin the new ship farther out on the same ray.
export const arrivalOutsideField = function (state: State, point: Point, kind: Enemy['kind']): Point {
	const center = fieldRelative(state); const radius = enemyClearance({ kind });
	if (!center || Math.hypot(point.x - center.x, point.y - center.y) > radius) return point;
	const length = Math.hypot(point.x, point.y);
	if (length === 0) return { x: center.x + radius + 1, y: center.y };
	const dx = point.x / length; const dy = point.y / length;
	const along = center.x * dx + center.y * dy;
	const across = center.x * dy - center.y * dx;
	const outside = Math.max(length, along + Math.sqrt(Math.max(0, radius * radius - across * across)) + 1);
	return { x: dx * outside, y: dy * outside };
};
const move = function (point: Point, target: Point, travel: number) {
	const distance = Math.hypot(target.x - point.x, target.y - point.y);
	if (distance === 0) return;
	const fraction = Math.min(1, travel / distance);
	point.x += (target.x - point.x) * fraction; point.y += (target.y - point.y) * fraction;
};

// Only detouring ships use the field's world frame. Compensating actual route drift keeps
// even a slow capital ship outside a field that the ark passes at maximum engine power.
export const navigateField = function (state: State, enemy: Enemy, destination: Point, speed: number, dt: number, drift: number, approaching: boolean): boolean {
	const systems = state.systems; const field = systems?.interdiction.field; const center = fieldRelative(state);
	if (!systems || !field || !center) { delete enemy.detour; delete enemy.interdictionSide; return false; }
	const radius = enemyClearance(enemy);
	const compensated = { x: enemy.x - drift, y: enemy.y };
	const blocked = circleHit(enemy, destination, center, approaching ? radius - 8 : INTERDICTION_CONFIG.radius + (enemy.detour ? 8 : 0)) !== undefined
		|| circleHit(compensated, enemy, center, radius - 8) !== undefined;
	if (!blocked) { delete enemy.detour; return false; }
	if (!enemy.detour || enemy.detour.fieldId !== field.id) {
		const cross = (compensated.x - center.x) * (destination.y - center.y) - (compensated.y - center.y) * (destination.x - center.x);
		const remembered = enemy.interdictionSide?.fieldId === field.id ? enemy.interdictionSide : undefined;
		const side: -1 | 1 = remembered?.side ?? (Math.abs(cross) < 1e-6 ? enemy.id % 2 === 0 ? 1 : -1 : cross > 0 ? 1 : -1);
		const angle = Math.atan2(compensated.y - center.y, compensated.x - center.x);
		const distance = Math.hypot(compensated.x - center.x, compensated.y - center.y);
		const tangent = angle + side * Math.acos(Math.min(1, radius / Math.max(radius, distance)));
		enemy.detour = { fieldId: field.id, side, waypoint: { x: field.world.x + Math.cos(tangent) * radius, y: field.world.y + Math.sin(tangent) * radius } };
		if (!remembered) systems.interdiction.redirected++;
		enemy.interdictionSide = { fieldId: field.id, side };
	}
	enemy.x = compensated.x;
	const detour = enemy.detour;
	let waypoint = { x: detour.waypoint.x - systems.distanceTraveled, y: detour.waypoint.y };
	// A target inside the field cannot be engaged. Wait at the boundary until it emerges;
	// repeatedly circling an unreachable escort would otherwise create an infinite orbit.
	const targetInside = Math.hypot(destination.x - center.x, destination.y - center.y) <= INTERDICTION_CONFIG.radius;
	if (Math.hypot(enemy.x - waypoint.x, enemy.y - waypoint.y) <= speed * dt + 0.1 && !targetInside) {
		const angle = Math.atan2(waypoint.y - center.y, waypoint.x - center.x) + detour.side * 0.25;
		detour.waypoint = { x: field.world.x + Math.cos(angle) * radius, y: field.world.y + Math.sin(angle) * radius };
		waypoint = { x: detour.waypoint.x - systems.distanceTraveled, y: detour.waypoint.y };
	}
	move(enemy, waypoint, speed * dt);
	return true;
};

export const advanceInterdiction = function (state: State, dt: number) {
	const interdiction = state.systems?.interdiction;
	if (!interdiction) return;
	interdiction.cooldown = Math.max(0, interdiction.cooldown - dt);
	const field = interdiction.field;
	if (!field) return;
	field.remaining = Math.max(0, field.remaining - dt);
	const relative = fieldRelative(state);
	if (field.remaining > 1e-8 && relative && relative.x >= -INTERDICTION_CONFIG.leftBehind) return;
	interdiction.field = undefined;
	for (const enemy of state.enemies) { delete enemy.detour; delete enemy.interdictionSide; }
};
