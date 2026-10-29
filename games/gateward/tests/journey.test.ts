import { expect, test } from 'bun:test';
import { beaconAt, BEACON_SPACING, CRUISE_SPEED, journeyAt, ROUTE_LENGTH } from '../src/journey';
import { project } from '../src/projection';
import { ROUTE_SECONDS } from '../src/simulation';

test('the journey starts at departure and stops at the destination, including overtime combat', function () {
	expect(journeyAt(0)).toEqual({ distance: 0, remaining: ROUTE_LENGTH, speed: 0 });
	expect(journeyAt(-5)).toEqual(journeyAt(0)); expect(journeyAt(NaN)).toEqual(journeyAt(0));
	expect(journeyAt(ROUTE_SECONDS / 2)).toEqual({ distance: ROUTE_LENGTH / 2, remaining: ROUTE_LENGTH / 2, speed: CRUISE_SPEED });
	expect(journeyAt(ROUTE_SECONDS)).toEqual({ distance: ROUTE_LENGTH, remaining: 0, speed: 0 });
	expect(journeyAt(ROUTE_SECONDS + 100)).toEqual(journeyAt(ROUTE_SECONDS));
});

test('fixed landmarks approach, pass the ship once, and the final beacon coincides with the gate', function () {
	expect(beaconAt(1, 0).x).toBe(BEACON_SPACING);
	expect(beaconAt(1, 35).x).toBe(0); expect(beaconAt(1, 40).x).toBeLessThan(0);
	for (const time of [0, 10, 35, 100, 209, 210, 300]) expect(beaconAt(6, time).x).toBe(journeyAt(time).remaining);
	expect(beaconAt(6, ROUTE_SECONDS).x).toBe(0);
});

test('passing scenery moves opposite the isometric bow direction at the actual travel rate', function () {
	const before = project(beaconAt(2, 20)); const after = project(beaconAt(2, 22));
	const forward = project({ x: CRUISE_SPEED * 2, y: 0 });
	expect(after.x - before.x).toBeCloseTo(-forward.x); expect(after.y - before.y).toBeCloseTo(-forward.y);
	expect(after.x).toBeLessThan(before.x); expect(after.y).toBeLessThan(before.y);
});
