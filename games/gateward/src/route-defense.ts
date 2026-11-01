import { tactical } from './combat-scale';
import { ENCOUNTERS } from './scenarios';
import type { Arrival, Point, State } from './simulation';

export interface RouteSpawn {
	point: Readonly<Point>;
	side: -1 | 1;
	distance: number;
	activated: boolean;
}

export const ENCOUNTER_SPAWN = {
	deploymentRange: tactical(400),
	activationRange: tactical(325),
	distanceMultiplier: 2,
} as const;

const lineDistance = function (routeLength: number, line: number, count: number): number {
	return routeLength * line / (count + 1);
};

export const spawnTrigger = function (routeLength: number, line: number, count: number): number {
	return Math.max(0, lineDistance(routeLength, line, count) - ENCOUNTER_SPAWN.deploymentRange);
};

// Route progress schedules encounters. Double each original route position
// away from the ark at deployment; the resulting point is only a spawn origin.
export const spawnArrivals = function (state: State, count: number): Arrival[] {
	const line = state.wave;
	const distance = lineDistance(state.systems.routeLength, line, count);
	const encounter = ENCOUNTERS[line - 1];
	if (!encounter) return [];
	return Array.from({ length: encounter.count }, function (_, i): Arrival {
		const kind = encounter.kind;
		const side = i % 2 === 0 ? -1 : 1;
		const original = {
			x: state.routeOrigin.x + distance + tactical((i % 3 - 1) * 25),
			y: state.routeOrigin.y + side * tactical(100 + i % 3 * 25),
		};
		const point = {
			x: state.ark.x + (original.x - state.ark.x) * ENCOUNTER_SPAWN.distanceMultiplier,
			y: state.ark.y + (original.y - state.ark.y) * ENCOUNTER_SPAWN.distanceMultiplier,
		};
		return { at: state.time, kind, ...point, spawn: { point, side, distance, activated: false } };
	});
};
