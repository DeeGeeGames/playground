import type { Point, Shell, Ship, State } from './simulation';
import { MOUNT_SOCKETS, type WeaponId } from './weapons';

export const smooth = function (value: number) {
	const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t);
};
export const muzzleShape = function (weapon: WeaponId) {
	return { forward: weapon === 'rail' ? 25 : weapon === 'rattler' ? 20 : weapon === 'seeker' ? 0 : weapon === 'torpedo' ? 17 : 15,
		elevation: weapon === 'seeker' ? 35 : weapon === 'rattler' || weapon === 'rail' || weapon === 'torpedo' ? 30 : 31 };
};
export const muzzlePoint = function (ship: Ship, slot: number, weapon: WeaponId, heading: number, recoil = 0) {
	const socket = MOUNT_SOCKETS[slot]; const shape = muzzleShape(weapon);
	const forward = socket?.forward ?? 0; const across = socket?.across ?? 0;
	return { x: ship.x + Math.cos(ship.angle) * forward - Math.sin(ship.angle) * across + Math.cos(heading) * (shape.forward - recoil),
		y: ship.y + Math.sin(ship.angle) * forward + Math.cos(ship.angle) * across + Math.sin(heading) * (shape.forward - recoil), elevation: shape.elevation };
};
export const hullMuzzle = function (ship: Ship, heading: number) {
	const height = ship.length > 150 ? 1 : 0.75;
	const forward = ship.length * (ship.length > 150 ? 0.1 : 0.13);
	const across = (Math.sin(heading - ship.angle) < 0 ? -1 : 1) * (ship.width * 0.5 + 2.5 * height);
	return { point: { x: ship.x + Math.cos(ship.angle) * forward - Math.sin(ship.angle) * across,
		y: ship.y + Math.sin(ship.angle) * forward + Math.cos(ship.angle) * across },
		source: { shipId: ship.id, forward, across, heading, elevation: 24 * height } };
};
// Hostile collision rays historically start at hull centers. Move only their
// presentation from the gun to that ray with a zero-slope blend at both ends.
// The head and its history always use the same point; combat remains unchanged.
export const projectilePoint = function (shell: Shell, time: number): Point {
	const launch = shell.launch; const offset = launch?.offset;
	const blend = launch && offset ? 1 - smooth((time - launch.time) / 0.4) : 0;
	return { x: shell.x + (offset?.x ?? 0) * blend, y: shell.y + (offset?.y ?? 0) * blend };
};
export const projectileVelocity = function (shell: Shell, time: number): Point {
	const launch = shell.launch; const offset = launch?.offset;
	const t = launch ? Math.max(0, Math.min(1, (time - launch.time) / 0.4)) : 0;
	const rate = 6 * t * (1 - t) / 0.4;
	return { x: shell.vx - (offset?.x ?? 0) * rate, y: shell.vy - (offset?.y ?? 0) * rate };
};
export const driveShape = function (length: number, width: number) {
	const height = length > 150 ? 1 : 0.75;
	return { forward: -length * 0.567, across: width * 0.355, elevation: 12 * height, radius: width * 0.0525, height: 4 * height };
};
export const driveLength = function (ship: Ship, state: State, reduced: boolean) {
	const power = ship.id === 0 ? Math.abs(state.player.throttle) : 0.6;
	const pulse = reduced ? 1 : 1 + Math.sin(state.time * 5 + ship.id) * 0.025 + Math.sin(state.time * 8.3 + ship.id) * 0.012;
	return (10 + power * 26 + Math.min(32, Math.hypot(ship.vx, ship.vy) * 0.25)) * pulse;
};
export const createDriveAnimator = function () {
	const drives = new WeakMap<Ship, { time: number; length: number }>();
	return function (ship: Ship, state: State, reduced: boolean) {
		const target = driveLength(ship, state, reduced); const previous = drives.get(ship);
		const dt = previous ? state.time - previous.time : -1;
		const length = previous && dt >= 0 ? previous.length + (target - previous.length) * (1 - Math.exp(-dt / 0.16)) : target;
		drives.set(ship, { time: state.time, length }); return length;
	};
};
export const shieldEnvelope = function (remaining: number) {
	return smooth((3 - remaining) / 0.18) * smooth(remaining / 0.4);
};

export interface TrailPoint extends Point { time: number }
// Every vertex is an observed position. Time clipping interpolates only within
// an observed segment, never backwards from the current velocity or past a turn.
export const sampleTrail = function (previous: readonly TrailPoint[], point: Point, time: number, seconds: number): TrailPoint[] {
	const last = previous.at(-1);
	if (last && time === last.time) return [...previous];
	if (!last || time < last.time || time - last.time > 0.15 || Math.hypot(point.x - last.x, point.y - last.y) > 300) return [{ x: point.x, y: point.y, time }];
	const points = [...previous, { x: point.x, y: point.y, time }]; const cutoff = time - seconds;
	const first = points.findIndex(function (entry) { return entry.time >= cutoff; });
	const result = points.slice(Math.max(0, first)); const before = points[first - 1]; const after = result[0];
	if (before && after && after.time > before.time) {
		const t = (cutoff - before.time) / (after.time - before.time);
		result.unshift({ x: before.x + (after.x - before.x) * t, y: before.y + (after.y - before.y) * t, time: cutoff });
	}
	return result.slice(-96);
};
