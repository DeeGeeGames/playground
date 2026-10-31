import { tactical } from './combat-scale';
import type { Enemy, Point, State } from './simulation';
import { arkVelocity, localPoint, worldPoint } from './space';

export interface Flight {
	angle: number;
	pitch?: number;
	vz?: number;
	// Small craft retain world velocity independently of hull orientation.
	vx?: number;
	vy?: number;
	angularVelocity?: number;
	pitchVelocity?: number;
	speed: number;
	side: -1 | 1;
	course: 'intercept' | 'broadside';
	run: -1 | 1;
}

const clamp = function (value: number, limit: number): number { return Math.max(-limit, Math.min(limit, value)); };
const length = function (point: Point): number { return Math.hypot(point.x, point.y); };
export const isCapital = function (enemy: Pick<Enemy, 'kind'>): boolean { return enemy.kind === 'carrier' || enemy.kind === 'armored' || enemy.kind === 'flagship'; };

// Small-craft thrusters redirect momentum over time. Yaw also accelerates and
// brakes, rather than immediately reaching the commanded turn rate.
const flyInertial = function (point: Point, flight: Flight, desired: Point, maxSpeed: number, turnRate: number, dt: number, heavy: boolean): void {
	const magnitude = length(desired);
	const angle = magnitude < 0.01 ? flight.angle : Math.atan2(desired.y, desired.x);
	const turn = Math.atan2(Math.sin(angle - flight.angle), Math.cos(angle - flight.angle));
	const angularAcceleration = turnRate * (heavy ? 0.5 : 0.8);
	const desiredYaw = Math.sign(turn) * Math.min(turnRate * (heavy ? 0.45 : 0.55), Math.abs(turn) * 2, Math.sqrt(2 * angularAcceleration * Math.abs(turn)));
	flight.angularVelocity = (flight.angularVelocity ?? 0) + clamp(desiredYaw - (flight.angularVelocity ?? 0), angularAcceleration * dt);
	const previousAngle = flight.angle;
	flight.angle += flight.angularVelocity * dt;

	const climb = clamp(desired.z ?? 0, maxSpeed * 0.3);
	const speed = Math.min(Math.sqrt(Math.max(0, maxSpeed ** 2 - climb ** 2)), magnitude) * Math.max(0, Math.cos(turn));
	const vx = flight.vx ?? Math.cos(previousAngle) * flight.speed;
	const vy = flight.vy ?? Math.sin(previousAngle) * flight.speed;
	const vz = flight.vz ?? 0;
	const dx = Math.cos(flight.angle) * speed - vx;
	const dy = Math.sin(flight.angle) * speed - vy;
	const dz = climb - vz;
	const change = Math.hypot(dx, dy, dz);
	const thrust = change > 0 ? Math.min(1, maxSpeed * (heavy ? 0.45 : 0.65) * dt / change) : 0;
	flight.vx = vx + dx * thrust; flight.vy = vy + dy * thrust;
	flight.vz = vz + dz * thrust;
	const before = point.z ?? 0;
	point.z = clamp(before + flight.vz * dt, FLIGHT_BAND);
	flight.vz = (point.z - before) / dt;
	flight.speed = Math.hypot(flight.vx, flight.vy);
	point.x += flight.vx * dt; point.y += flight.vy * dt;
	if (heavy) pitchHeavy(flight, dt);
	else flight.pitch = Math.atan2(flight.vz, Math.max(1, flight.speed));
};

// Heavy hulls build and brake rotation before settling on the commanded bearing.
const heavyRotation = function (error: number, velocity: number, rate: number, acceleration: number, dt: number): number {
	const desired = Math.sign(error) * Math.min(rate, Math.abs(error) * 2, Math.sqrt(2 * acceleration * Math.abs(error)));
	return velocity + clamp(desired - velocity, acceleration * dt);
};

const pitchHeavy = function (flight: Flight, dt: number): void {
	const pitch = flight.pitch ?? 0;
	const desiredPitch = Math.atan2(flight.vz ?? 0, Math.max(1, flight.speed));
	flight.pitchVelocity = heavyRotation(desiredPitch - pitch, flight.pitchVelocity ?? 0, 0.2, 0.12, dt);
	flight.pitch = pitch + flight.pitchVelocity * dt;
};

// Capitals keep heading-following courses, with slower thrust and rotational response.
export const fly = function (point: Point, flight: Flight, desired: Point, maxSpeed: number, turnRate: number, dt: number, inertial = false, heavy = false): void {
	if (dt <= 0) return;
	if (inertial) { flyInertial(point, flight, desired, maxSpeed, turnRate, dt, heavy); return; }
	const angle = length(desired) < 0.01 ? flight.angle : Math.atan2(desired.y, desired.x);
	const turn = Math.atan2(Math.sin(angle - flight.angle), Math.cos(angle - flight.angle));
	const climb = clamp(desired.z ?? 0, maxSpeed * 0.3);
	const planarLimit = Math.sqrt(Math.max(0, maxSpeed * maxSpeed - climb ** 2));
	const desiredSpeed = Math.min(planarLimit, length(desired)) * Math.max(0, Math.cos(turn));
	flight.angularVelocity = heavyRotation(turn, flight.angularVelocity ?? 0, turnRate * 0.65, turnRate * 0.35, dt);
	flight.angle += flight.angularVelocity * dt;
	flight.speed = Math.min(planarLimit, flight.speed + clamp(desiredSpeed - flight.speed, maxSpeed * 0.45 * dt));

	const vz = clamp(desired.z ?? 0, maxSpeed * 0.3);
	flight.vz = (flight.vz ?? 0) + clamp(vz - (flight.vz ?? 0), maxSpeed * 0.2 * dt);
	const before = point.z ?? 0;
	point.z = clamp(before + flight.vz * dt, FLIGHT_BAND);
	flight.vz = (point.z - before) / dt;
	flight.speed = Math.min(flight.speed, Math.sqrt(Math.max(0, maxSpeed * maxSpeed - flight.vz ** 2)));
	point.x += Math.cos(flight.angle) * flight.speed * dt;
	point.y += Math.sin(flight.angle) * flight.speed * dt;
	pitchHeavy(flight, dt);
};

export const createFlight = function (point: Point, desired: Point, speed: number, id: number): Flight {
	return { angle: Math.atan2(desired.y, desired.x), speed: Math.min(speed, length(desired)), side: point.y < 0 ? -1 : point.y > 0 ? 1 : id % 2 ? -1 : 1, course: 'intercept', run: 1 };
};

export const arriveCourse = function (point: Point, destination: Point, targetVelocity: Point, response = 1.5): Point {
	return { x: targetVelocity.x + (destination.x - point.x) * response, y: targetVelocity.y + (destination.y - point.y) * response };
};

export const capitalCourse = function (state: State, enemy: Enemy, flight: Flight, range: number, speed: number): Point {
	const relative = localPoint(state, enemy); const velocity = arkVelocity(state);
	const lane = flight.side * (tactical(30) + range * 0.7 + (enemy.id % 3 - 1) * tactical(12));
	const interceptX = -tactical(65) + (enemy.id % 4) * tactical(40);
	if (flight.course === 'intercept' && Math.abs(relative.y - lane) < tactical(30) && Math.abs(relative.x - interceptX) < tactical(100)) flight.course = 'broadside';
	if (flight.course === 'intercept') {
		const destination = worldPoint(state, { x: interceptX, y: lane });
		return arriveCourse(enemy, destination, velocity, 0.5);
	}
	// Overtake, then ease aft without parking at a firing-range boundary. At low
	// engine power this becomes a turning return pass beside the stationary ark.
	if (relative.x > tactical(135)) flight.run = -1;
	if (relative.x < -tactical(135)) flight.run = 1;
	const c = Math.cos(state.ark.angle); const s = Math.sin(state.ark.angle);
	const lateral = clamp((lane - relative.y) * 0.6, speed * 0.7);
	return { x: velocity.x + c * flight.run * tactical(9) - s * lateral, y: velocity.y + s * flight.run * tactical(9) + c * lateral };
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
		if (distance > 0.01 && distance < tactical(38)) { const push = (tactical(38) - distance) / tactical(38) * speed; vx += dx / distance * push; vy += dy / distance * push; }
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

// A scaled 130m deep operating volume around the nominal flight layer. Capitals hold
// stable lanes; lighter craft weave through them while tracking target altitude.
export const FLIGHT_BAND = tactical(65);
export const altitudeCourse = function (id: number, time: number, capital: boolean, target: Point, returning = false): number {
	if (returning) return 0;
	const lane = (id % 5 - 2) * tactical(capital ? 24 : 12);
	return clamp((target.z ?? 0) + lane + (capital ? 0 : Math.sin(time * 0.45 + id * 1.7) * tactical(28)), FLIGHT_BAND);
};
