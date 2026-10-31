import { DECK_HEIGHT, FLIGHT_HEIGHT, TURRET_RISE, TURRET_SCALE } from './ship-config';
import type { Flight } from './flight';
import type { Mount, Point, State } from './simulation';

export const DECK_ALTITUDE = DECK_HEIGHT - FLIGHT_HEIGHT;

// Only ship fittings and formation orders use local offsets. Active actors,
// projectiles, fields and effects always store absolute world positions.
export const worldPoint = function (state: State, offset: Point): Point {
	const c = Math.cos(state.ark.angle); const s = Math.sin(state.ark.angle);
	return { x: state.ark.x + c * offset.x - s * offset.y, y: state.ark.y + s * offset.x + c * offset.y, ...(offset.z === undefined ? {} : { z: offset.z }) };
};
export const localPoint = function (state: State, point: Point): Point {
	const dx = point.x - state.ark.x; const dy = point.y - state.ark.y;
	const c = Math.cos(state.ark.angle); const s = Math.sin(state.ark.angle);
	return { x: c * dx + s * dy, y: -s * dx + c * dy, ...(point.z === undefined ? {} : { z: point.z }) };
};
export const arkVelocity = function (state: State): Point {
	return { x: Math.cos(state.ark.angle) * state.ark.speed, y: Math.sin(state.ark.angle) * state.ark.speed };
};
export const flightVelocity = function (flight: Flight | undefined): Point {
	return flight ? { x: Math.cos(flight.angle) * flight.speed, y: Math.sin(flight.angle) * flight.speed, z: flight.vz ?? 0 } : { x: 0, y: 0 };
};
export const mountWorld = function (state: State, mount: Mount): Point { return { ...worldPoint(state, mount), z: DECK_HEIGHT + TURRET_RISE * TURRET_SCALE - FLIGHT_HEIGHT }; };
