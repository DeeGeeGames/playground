import type { Enemy, Point, State } from './simulation';
import { arkVelocity, localPoint, worldPoint } from './space';

export interface Flight {
	angle: number;
	speed: number;
	side: -1 | 1;
	course: 'intercept' | 'broadside';
	run: -1 | 1;
}

const clamp = function (value: number, limit: number): number { return Math.max(-limit, Math.min(limit, value)); };
const length = function (point: Point): number { return Math.hypot(point.x, point.y); };
export const isCapital = function (enemy: Pick<Enemy, 'kind'>): boolean { return enemy.kind === 'carrier' || enemy.kind === 'armored' || enemy.kind === 'flagship'; };

// Every flying craft advances along its hull heading in world space. Brake into
// turns rather than translating sideways or rotating the model after movement.
export const fly = function (point: Point, flight: Flight, desired: Point, maxSpeed: number, turnRate: number, dt: number): void {
	const angle = length(desired) < 0.01 ? flight.angle : Math.atan2(desired.y, desired.x);
	const turn = Math.atan2(Math.sin(angle - flight.angle), Math.cos(angle - flight.angle));
	const desiredSpeed = Math.min(maxSpeed, length(desired)) * Math.max(0, Math.cos(turn));
	flight.angle += clamp(turn, turnRate * dt);
	flight.speed += clamp(desiredSpeed - flight.speed, maxSpeed * 2 * dt);
	point.x += Math.cos(flight.angle) * flight.speed * dt;
	point.y += Math.sin(flight.angle) * flight.speed * dt;
};

export const createFlight = function (point: Point, desired: Point, speed: number, id: number): Flight {
	return { angle: Math.atan2(desired.y, desired.x), speed: Math.min(speed, length(desired)), side: point.y < 0 ? -1 : point.y > 0 ? 1 : id % 2 ? -1 : 1, course: 'intercept', run: 1 };
};

export const arriveCourse = function (point: Point, destination: Point, targetVelocity: Point, response = 1.5): Point {
	return { x: targetVelocity.x + (destination.x - point.x) * response, y: targetVelocity.y + (destination.y - point.y) * response };
};

export const capitalCourse = function (state: State, enemy: Enemy, flight: Flight, range: number, speed: number): Point {
	const relative = localPoint(state, enemy); const velocity = arkVelocity(state);
	const lane = flight.side * (30 + range * 0.7 + (enemy.id % 3 - 1) * 12);
	const interceptX = -65 + (enemy.id % 4) * 40;
	if (flight.course === 'intercept' && Math.abs(relative.y - lane) < 30 && Math.abs(relative.x - interceptX) < 100) flight.course = 'broadside';
	if (flight.course === 'intercept') {
		const destination = worldPoint(state, { x: interceptX, y: lane });
		return arriveCourse(enemy, destination, velocity, 0.5);
	}
	// Overtake, then ease aft without parking at a firing-range boundary. At low
	// engine power this becomes a turning return pass beside the stationary ark.
	if (relative.x > 135) flight.run = -1;
	if (relative.x < -135) flight.run = 1;
	const c = Math.cos(state.ark.angle); const s = Math.sin(state.ark.angle);
	const lateral = clamp((lane - relative.y) * 0.6, speed * 0.7);
	return { x: velocity.x + c * flight.run * 9 - s * lateral, y: velocity.y + s * flight.run * 9 + c * lateral };
};

export const fighterCourse = function (point: Point, target: Point, radiusX: number, radiusY: number, speed: number, direction: -1 | 1, targetVelocity: Point, neighbors: readonly Point[]): Point {
	const x = (point.x - target.x) / radiusX; const y = (point.y - target.y) / radiusY;
	const radius = Math.max(0.01, Math.hypot(x, y));
	const radial = clamp((radius - 1) * 2, 1);
	const tangent = radius > 1.6 ? 0.3 : 0.9;
	let vx = (-x / radius * radial - y / radius * direction * tangent) * speed;
	let vy = (-y / radius * radial + x / radius * direction * tangent) * speed;
	for (const neighbor of neighbors) {
		const dx = point.x - neighbor.x; const dy = point.y - neighbor.y; const distance = Math.hypot(dx, dy);
		if (distance > 0.01 && distance < 38) { const push = (38 - distance) / 38 * speed; vx += dx / distance * push; vy += dy / distance * push; }
	}
	return { x: vx + targetVelocity.x, y: vy + targetVelocity.y };
};

// The paired side banks cover 100 degrees each. Bow/stern targets must wait for
// the hull to turn; weapon aim never rotates the ship away from its course.
export const broadsideMuzzle = function (enemy: Enemy, target: Point): Point | undefined {
	const angle = enemy.flight?.angle ?? 0;
	const dx = target.x - enemy.x; const dy = target.y - enemy.y; const distance = Math.hypot(dx, dy);
	if (distance === 0 || !inBroadside(angle, enemy, target)) return undefined;
	const side = Math.cos(angle) * dy - Math.sin(angle) * dx < 0 ? -1 : 1;
	const offset = enemy.kind === 'flagship' ? 31 : 20;
	const along = enemy.id % 2 ? -10 : 10;
	return { x: enemy.x + Math.cos(angle) * along - Math.sin(angle) * side * offset, y: enemy.y + Math.sin(angle) * along + Math.cos(angle) * side * offset };
};

export const inBroadside = function (angle: number, from: Point, to: Point): boolean {
	const dx = to.x - from.x; const dy = to.y - from.y; const distance = Math.hypot(dx, dy);
	return distance > 0 && Math.abs((dx * Math.cos(angle) + dy * Math.sin(angle)) / distance) <= Math.sin(50 * Math.PI / 180);
};
