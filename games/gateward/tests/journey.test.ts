import { tactical } from '../src/combat-scale';
import { expect, test } from 'bun:test';
import { beaconAt, beaconFor, journeyFor, BEACON_SPACING, CRUISE_SPEED, journeyAt, ROUTE_LENGTH } from '../src/journey';
import { project } from '../src/projection';
import { createState, setAllocation, step, ROUTE_SECONDS } from '../src/simulation';

test('the journey starts at departure and stops at the destination, on arrival', function () {
	expect(journeyAt(0)).toEqual({ distance: 0, remaining: ROUTE_LENGTH, speed: 0 });
	expect(journeyAt(-5)).toEqual(journeyAt(0)); expect(journeyAt(NaN)).toEqual(journeyAt(0));
	expect(journeyAt(ROUTE_SECONDS / 2)).toEqual({ distance: ROUTE_LENGTH / 2, remaining: ROUTE_LENGTH / 2, speed: CRUISE_SPEED });
	expect(journeyAt(ROUTE_SECONDS)).toEqual({ distance: ROUTE_LENGTH, remaining: 0, speed: 0 });
	expect(journeyAt(ROUTE_SECONDS + 100)).toEqual(journeyAt(ROUTE_SECONDS));
});

test('fixed landmarks approach, pass the ship once, and the final beacon coincides with the gate', function () {
	expect(beaconAt(1, 0).x).toBe(BEACON_SPACING);
	expect(beaconAt(1, ROUTE_SECONDS / 6).x).toBe(0); expect(beaconAt(1, ROUTE_SECONDS / 6 + 5).x).toBeLessThan(0);
	for (const time of [0, 10, 35, 100, 209, 210, 300]) expect(beaconAt(6, time).x).toBe(journeyAt(time).remaining);
	expect(beaconAt(6, ROUTE_SECONDS).x).toBe(0);
});

test('passing scenery moves opposite the isometric bow direction at the actual travel rate', function () {
	const before = project(beaconAt(2, 20)); const after = project(beaconAt(2, 22));
	const forward = project({ x: CRUISE_SPEED * 2, y: 0 });
	expect(after.x - before.x).toBeCloseTo(-forward.x); expect(after.y - before.y).toBeCloseTo(-forward.y);
	expect(after.x).toBeLessThan(before.x); expect(after.y).toBeLessThan(before.y);
});


test('every state journey uses distance from engines rather than elapsed time', function () {
	const drill = createState(); drill.status = 'running'; drill.time = 45; drill.systems.distanceTraveled = tactical(540);
	expect(journeyFor(drill).distance).toBe(tactical(540)); expect(beaconFor(6, drill).x).toBe(tactical(1440));
	drill.time = 90; expect(journeyFor(drill).distance).toBe(tactical(540));
	const voyage = createState(); voyage.status = 'running'; voyage.time = 45;
	expect(journeyFor(voyage).distance).toBe(0);
});

test('systems landmarks, ETA and route fraction use integrated distance through reallocations', function () {
	const state = createState();
	expect(journeyFor(state)).toEqual({ distance: 0, remaining: tactical(1440), speed: 0, progress: 0, eta: 240 });
	state.status = 'running'; state.nextWave = Infinity;
	for (let i = 0; i < 100; i++) step(state, 0.05);
	expect(journeyFor(state).distance).toBeCloseTo(tactical(30)); expect(journeyFor(state).eta).toBeCloseTo(235);
	setAllocation(state, { engines: 6, weapons: 2, shields: 2 });
	for (let i = 0; i < 100; i++) step(state, 0.05);
	const journey = journeyFor(state);
	expect(journey.distance).toBeCloseTo(tactical(75)); expect(journey.speed).toBe(tactical(9)); expect(journey.progress).toBeCloseTo(tactical(75) / tactical(1440)); expect(journey.eta).toBeCloseTo(tactical(1365) / tactical(9));
	expect(beaconFor(6, state).x).toBe(tactical(1440)); expect(beaconFor(1, state).x).toBe(tactical(240));
	expect(beaconFor(6, state).x - state.ark.x).toBeCloseTo(journey.remaining);
	setAllocation(state, { engines: 0, weapons: 4, shields: 6 });
	step(state, 0.05); expect(journeyFor(state).distance).toBe(journey.distance); expect(journeyFor(state).eta).toBe(Infinity); expect(journeyFor(state).speed).toBe(0);
});

test('actual speed stops during pause, focus loss, results and arrival while configured ETA remains useful', function () {
	const state = createState(); state.status = 'running';
	expect(journeyFor(state).speed).toBe(tactical(6));
	state.paused = true; expect(journeyFor(state).speed).toBe(0); expect(journeyFor(state).eta).toBe(240);
	state.paused = false; state.focused = false; expect(journeyFor(state).speed).toBe(0);
	state.focused = true; state.status = 'lost'; expect(journeyFor(state).speed).toBe(0);
	state.status = 'running'; if (!state.systems) throw new Error('Missing systems');
	state.systems.distanceTraveled = state.systems.routeLength;
	expect(journeyFor(state)).toEqual({ distance: tactical(1440), remaining: 0, speed: 0, progress: 1, eta: 0 });
});
