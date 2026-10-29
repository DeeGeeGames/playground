import { ROUTE_SECONDS } from './simulation';

export const ROUTE_LENGTH = 2520;
export const CRUISE_SPEED = ROUTE_LENGTH / ROUTE_SECONDS;
export const BEACON_SPACING = ROUTE_LENGTH / 6;

export const journeyAt = function (time: number) {
	const elapsed = Number.isFinite(time) ? Math.max(0, Math.min(ROUTE_SECONDS, time)) : 0;
	const distance = elapsed * CRUISE_SPEED;
	return { distance, remaining: ROUTE_LENGTH - distance, speed: elapsed > 0 && elapsed < ROUTE_SECONDS ? CRUISE_SPEED : 0 };
};

// Ship-relative coordinates of fixed scenery along the route. Combat stays in
// the ark's local frame; visual navigation never changes simulation positions.
export const beaconAt = function (index: number, time: number) {
	return { x: index * BEACON_SPACING - journeyAt(time).distance, y: 0 };
};
