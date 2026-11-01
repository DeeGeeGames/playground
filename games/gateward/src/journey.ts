import { effectiveOutputs } from './systems';
import { ROUTE_LENGTH, ROUTE_SECONDS, type State } from './simulation';

export { ROUTE_LENGTH } from './simulation';
export const CRUISE_SPEED = ROUTE_LENGTH / ROUTE_SECONDS;
export const BEACON_SPACING = ROUTE_LENGTH / 6;

export const journeyAt = function (time: number) {
	const elapsed = Number.isFinite(time) ? Math.max(0, Math.min(ROUTE_SECONDS, time)) : 0;
	const distance = elapsed * CRUISE_SPEED;
	return { distance, remaining: ROUTE_LENGTH - distance, speed: elapsed > 0 && elapsed < ROUTE_SECONDS ? CRUISE_SPEED : 0 };
};

// Nominal ship-relative scenery for geometry checks. Live navigation uses
// beaconFor and the simulation's integrated world distance.
export const beaconAt = function (index: number, time: number) {
	return { x: index * BEACON_SPACING - journeyAt(time).distance, y: 0 };
};

// ETA is remaining travel at the configured engine allocation, excluding combat.
// It remains useful for fitting and paused planning; displayed speed is actual motion.
export const journeyFor = function (state: State) {
	const systems = state.systems;
	const distance = systems.distanceTraveled;
	const remaining = Math.max(0, systems.routeLength - distance);
	const configuredSpeed = effectiveOutputs(systems).speed;
	const moving = state.status === 'running' && !state.paused && state.focused && remaining > 0;
	return {
		distance, remaining,
		speed: moving ? configuredSpeed : 0,
		progress: distance / systems.routeLength,
		eta: remaining === 0 ? 0 : configuredSpeed > 0 ? remaining / configuredSpeed : Infinity,
	};
};

export const beaconFor = function (index: number, state: State) {
	return { x: state.routeOrigin.x + index * state.systems.routeLength / 6, y: state.routeOrigin.y };
};
