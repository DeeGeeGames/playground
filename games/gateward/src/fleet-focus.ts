import { FORMATION_SLOTS, HULLS } from './formation';
import { DECK_HEIGHT, FLIGHT_HEIGHT } from './ship-config';
import { worldPoint } from './space';
import { ESCORTS, MAX_HULL, type Escort, type Point, type State } from './simulation';

export type FleetFocus = 'ark' | `platform:${number}` | `escort:${number}`;
export interface FleetShip {
	readonly id: FleetFocus;
	readonly name: string;
	readonly detail: string;
	readonly point: Point;
	readonly elevation: number;
}

export const fleetShips = function (state: State): readonly FleetShip[] {
	const ships: FleetShip[] = [{ id: 'ark', name: 'Ark–07 / Gateward', detail: `${Math.ceil(state.hull)} / ${MAX_HULL} hull`, point: state.ark, elevation: 0 }];
	for (const platform of state.convoy?.platforms ?? []) {
		if (platform.hp <= 0) continue;
		const hull = HULLS[platform.hull];
		ships.push({ id: `platform:${platform.id}`, name: `P${platform.id + 1} ${hull.name}`, detail: `${FORMATION_SLOTS[platform.slot].label} · ${Math.ceil(platform.hp)} / ${hull.hp} hull`, point: worldPoint(state, FORMATION_SLOTS[platform.slot]), elevation: DECK_HEIGHT - 15 });
	}
	const escorts = new Map<number, Escort>();
	for (const wing of state.wings) for (const craft of wing.craft) escorts.set(craft.id, craft);
	for (const craft of state.escorts) escorts.set(craft.id, craft);
	for (const craft of escorts.values()) {
		if (craft.hp <= 0) continue;
		const deployed = state.escorts.some(function (escort) { return escort.id === craft.id; });
		const wing = state.wings.find(function (wing) { return wing.id === craft.wingId; });
		const status = deployed ? wing?.phase ?? craft.sector ?? 'deployed' : wing?.phase === 'rearming' ? 'rearming aboard ark' : 'docked aboard ark';
		ships.push({ id: `escort:${craft.id}`, name: `${craft.kind === 'guardian' ? 'Guardian' : 'Interceptor'} ${craft.id}`, detail: `${status} · ${Math.ceil(craft.hp)} / ${ESCORTS[craft.kind].hp} hull`, point: deployed ? craft : state.ark, elevation: deployed ? FLIGHT_HEIGHT + (craft.z ?? 0) : 0 });
	}
	return ships;
};

export const focusedShip = function (state: State, focus: FleetFocus): FleetShip {
	const ships = fleetShips(state);
	return ships.find(function (ship) { return ship.id === focus; }) ?? { id: 'ark', name: 'Ark–07 / Gateward', detail: `${Math.ceil(state.hull)} / ${MAX_HULL} hull`, point: state.ark, elevation: 0 };
};
