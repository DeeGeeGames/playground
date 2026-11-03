import { expect, test } from 'bun:test';
import { fleetShips, focusedShip, type FleetFocus } from '../src/fleet-focus';
import { FORMATION_SLOTS } from '../src/formation';
import { FLIGHT_HEIGHT } from '../src/ship-config';
import { arrangePlatform, createConvoyState, deploy, scramble, type State } from '../src/simulation';
import { worldPoint } from '../src/space';

test('platform focus follows the ship identity through formation swaps and world travel', function () {
	const state = createConvoyState();
	const platform = state.convoy?.platforms[0]; if (!platform) throw new Error('Missing platform');
	const id: FleetFocus = `platform:${platform.id}`;
	expect(arrangePlatform(state, platform.id, 'astern')).toBe(true);
	state.ark.x = 1700; state.ark.y = -600; state.ark.angle = Math.PI / 2;
	const ship = focusedShip(state, id);
	expect(ship.id).toBe(id);
	expect(ship.point).toEqual(worldPoint(state, FORMATION_SLOTS.astern));
	expect(state.convoy?.platforms[1]?.slot).toBe('port');
});

test('individual fighters remain selectable without duplicates through launch, flight and docking', function () {
	const state = createConvoyState(); expect(deploy(state, 'interceptor')).toBe(true);
	const wing = state.wings[0]; const craft = wing?.craft[0];
	if (!wing || !craft) throw new Error('Missing fighter');
	const id: FleetFocus = `escort:${craft.id}`;
	const checkCount = function (current: State) { expect(fleetShips(current).filter(function (ship) { return ship.id.startsWith('escort:'); })).toHaveLength(3); };
	checkCount(state);
	expect(focusedShip(state, id).point).toEqual(state.ark);
	state.status = 'running'; expect(scramble(state, wing.id, 'port')).toBe(true);
	craft.x = 1900; craft.y = -700; craft.z = 42;
	checkCount(state);
	expect(focusedShip(state, id).point).toEqual(craft);
	expect(focusedShip(state, id).elevation).toBe(FLIGHT_HEIGHT + 42);
	wing.phase = 'returning'; state.escorts = state.escorts.filter(function (escort) { return escort.id !== craft.id; });
	state.ark.x += 300;
	expect(focusedShip(state, id).id).toBe(id);
	expect(focusedShip(state, id).point).toEqual(state.ark);
	expect(focusedShip(state, id).elevation).toBe(0);
});

test('destroyed or removed fleet targets return to the ark without selecting a replacement', function () {
	const state = createConvoyState(); expect(deploy(state, 'guardian')).toBe(true);
	const platform = state.convoy?.platforms[0]; const guardian = state.escorts[0];
	if (!platform || !guardian) throw new Error('Missing fleet');
	const platformId: FleetFocus = `platform:${platform.id}`; const guardianId: FleetFocus = `escort:${guardian.id}`;
	platform.hp = 0; guardian.hp = 0;
	expect(focusedShip(state, platformId).id).toBe('ark');
	expect(focusedShip(state, guardianId).id).toBe('ark');
	expect(fleetShips(state).some(function (ship) { return ship.id === platformId || ship.id === guardianId; })).toBe(false);
	state.escorts = []; expect(deploy(state, 'guardian')).toBe(true);
	expect(focusedShip(state, guardianId).id).toBe('ark');
	expect(focusedShip(createConvoyState(), platformId).id).toBe(platformId);
	expect(focusedShip(createConvoyState(), guardianId).id).toBe('ark');
});
