import { enemyClearance } from './interdiction';
import type { EnemyKind, EscortKind, Point, State } from './simulation';
import { DECK_ALTITUDE, arkVelocity, flightVelocity, localPoint, worldPoint } from './space';

export interface Hull {
	id: number;
	point: Point;
	angle: number;
	velocity: Point;
	radius: number;
	spine: number;
	launchParent?: number | undefined;
}

// Horizontal capsules with vertical clearance form conservative ship hulls.
// Turrets, shields and engine plumes are deliberately outside these envelopes.
const dimensions: Record<EnemyKind | EscortKind, readonly [number, number]> = {
	interceptor: [6, 5], raider: [7.5, 5], bomber: [28, 16],
	guardian: [26, 25], armored: [30, 30], flagship: [56, 50], carrier: [65, 65],
};
export const traffic = function (state: State): Hull[] {
	return [{ id: 0, point: { ...state.ark, z: DECK_ALTITUDE }, angle: state.ark.angle, velocity: arkVelocity(state), radius: 52, spine: 100 },
		...[...state.escorts, ...state.enemies].filter(function (ship) { return ship.hp > 0; }).map(function (ship): Hull {
			const [radius, spine] = dimensions[ship.kind];
			return { id: ship.id, point: ship, angle: ship.flight?.angle ?? ('angle' in ship ? ship.angle : 0), velocity: flightVelocity(ship.flight), radius, spine, launchParent: 'launchRemaining' in ship && (ship.launchRemaining ?? 0) > 0 ? ship.launchedBy : undefined };
		})];
};
// Closest points on two hull centreline segments, including parallel courses.
const clearance = function (a: Hull, b: Hull): { gap: number; normal: Point } {
	const ax = Math.cos(a.angle) * a.spine; const ay = Math.sin(a.angle) * a.spine;
	const bx = Math.cos(b.angle) * b.spine; const by = Math.sin(b.angle) * b.spine;
	const rx = (a.point.x - b.point.x) - ax + bx; const ry = (a.point.y - b.point.y) - ay + by;
	const ux = 2 * ax; const uy = 2 * ay; const vx = 2 * bx; const vy = 2 * by;
	const aa = ux * ux + uy * uy; const bb = ux * vx + uy * vy; const cc = vx * vx + vy * vy;
	const dd = ux * rx + uy * ry; const ee = vx * rx + vy * ry;
	const denominator = aa * cc - bb * bb;
	const clamp = function (value: number): number { return Math.max(0, Math.min(1, value)); };
	let alongA = denominator > aa * cc * 1e-8 ? clamp((bb * ee - cc * dd) / denominator) : 0;
	const alongB = clamp((bb * alongA + ee) / cc);
	alongA = clamp((bb * alongB - dd) / aa);
	const dx = rx + ux * alongA - vx * alongB; const dy = ry + uy * alongA - vy * alongB;
	const vertical = Math.abs((a.point.z ?? 0) - (b.point.z ?? 0));
	const combined = a.radius + b.radius;
	const horizontal = Math.sqrt(Math.max(0, combined * combined - vertical * vertical));
	const length = Math.hypot(dx, dy);
	return { gap: vertical >= combined ? Math.hypot(length, vertical) - combined : length - horizontal, normal: length > 1e-5 ? { x: dx / length, y: dy / length } : { x: 0, y: a.id < b.id ? -1 : 1 } };
};

// Predict the desired course against each neighbour's current velocity. A
// consistent right-hand passing bias breaks head-on symmetry without randomness.
export const avoidTraffic = function (hull: Hull, desired: Point, neighbors: readonly Hull[], speed: number): Point {
	const magnitude = Math.hypot(desired.x, desired.y);
	if (magnitude < 0.01) return desired;
	const forward = { x: desired.x / magnitude, y: desired.y / magnitude };
	let x = forward.x * Math.min(speed, magnitude); let y = forward.y * Math.min(speed, magnitude);
	for (const other of neighbors) {
		if (other.id === hull.id) continue;
		const dx = other.point.x - hull.point.x; const dy = other.point.y - hull.point.y;
		if (Math.hypot(dx, dy) > hull.spine + other.spine + hull.radius + other.radius + speed * 3) continue;
		let threat = 0; const normal = clearance(hull, other).normal;
		for (const time of [0, 0.5, 1, 1.5]) {
			const predicted = clearance({ ...hull, point: { z: (hull.point.z ?? 0) + (hull.velocity.z ?? 0) * time, x: hull.point.x + forward.x * Math.min(speed, magnitude) * time, y: hull.point.y + forward.y * Math.min(speed, magnitude) * time } },
				{ ...other, point: { z: (other.point.z ?? 0) + (other.velocity.z ?? 0) * time, x: other.point.x + other.velocity.x * time, y: other.point.y + other.velocity.y * time } });
			const weight = Math.max(0, 1 - predicted.gap / 12) / (1 + time * 0.3);
			if (weight > threat) threat = weight;
		}
		if (threat === 0) continue;
		const strength = Math.min(1, threat) * speed;
		const tangent = { x: -normal.y, y: normal.x };
		const alignment = tangent.x * forward.x + tangent.y * forward.y;
		const side = Math.abs(alignment) > 0.1 ? Math.sign(alignment) : (tangent.x * forward.y - tangent.y * forward.x > 0 ? 1 : -1);
		x += (normal.x + tangent.x * side * 2 - forward.x) * strength;
		y += (normal.y + tangent.y * side * 2 - forward.y) * strength;
	}
	const length = Math.hypot(x, y);
	return length > speed ? { x: x / length * speed, y: y / length * speed, z: desired.z ?? 0 } : { x, y, z: desired.z ?? 0 };
};

// Resolve residual penetration after all ships move. The ark owns its route;
// other ships share displacement according to hull size. Contact adds no damage.
export const resolveTraffic = function (state: State): void {
	const hulls = traffic(state);
	for (let pass = 0; pass < 128; pass++) {
		let moved = false;
		for (const [i, a] of hulls.entries()) for (const b of hulls.slice(i + 1)) {
			if (a.launchParent === b.id || b.launchParent === a.id) continue;
			const { gap, normal } = clearance(a, b);
			if (gap >= -0.001) continue;
			const wa = a.id === 0 ? 0 : 1 / (a.radius * (a.spine + a.radius));
			const wb = 1 / (b.radius * (b.spine + b.radius));
			const push = -gap + 0.001;
			a.point.x += normal.x * push * wa / (wa + wb); a.point.y += normal.y * push * wa / (wa + wb);
			b.point.x -= normal.x * push * wb / (wa + wb); b.point.y -= normal.y * push * wb / (wa + wb);
			moved = true;
		}
		const field = state.systems.interdiction.field;
		if (field) for (const enemy of state.enemies) {
			if (enemy.hp <= 0) continue;
			const dx = enemy.x - field.world.x; const dy = enemy.y - field.world.y; const length = Math.hypot(dx, dy);
			const radius = enemyClearance(enemy);
			if (length >= radius) continue;
			enemy.x = field.world.x + (length > 1e-8 ? dx / length : 1) * (radius + 0.001);
			enemy.y = field.world.y + (length > 1e-8 ? dy / length : 0) * (radius + 0.001);
			moved = true;
		}
		if (!moved) break;
	}
};
export const hullClearance = clearance;

// Formation transfers across the ark need a waypoint beyond its bow or stern;
// local separation alone can otherwise keep a craft circling beside the hull.
export const trafficWaypoint = function (state: State, point: Point, destination: Point, kind: EscortKind): Point {
	const from = localPoint(state, point); const to = localPoint(state, destination);
	const [radius, spine] = dimensions[kind]; const width = 52 + radius + spine + 25; const end = 152 + radius + spine + 40;
	if (from.y * to.y >= 0 || Math.abs(to.y) < width) return destination;
	const crossing = from.x + (to.x - from.x) * -from.y / (to.y - from.y);
	if (Math.abs(crossing) > end) return destination;
	const x = from.x < -20 ? -end - 15 : end + 15;
	return worldPoint(state, { x, y: Math.abs(from.x) < end ? Math.sign(from.y || -1) * width : Math.sign(to.y) * width });
};
