import { tactical } from './combat-scale';
import { ENCOUNTERS } from './scenarios';
import type { Arrival, Point, State } from './simulation';

export interface RouteDefense {
	anchor: Readonly<Point>;
	side: -1 | 1;
	distance: number;
	disengaged: boolean;
}

export const VOYAGE_DEFENSE = {
	deploymentRange: tactical(400),
	engageRange: tactical(325),
	passDistance: tactical(240),
} as const;

const lineDistance = function (routeLength: number, line: number, count: number): number {
	return routeLength * line / (count + 1);
};

export const defenseTrigger = function (routeLength: number, line: number, count: number): number {
	return Math.max(0, lineDistance(routeLength, line, count) - VOYAGE_DEFENSE.deploymentRange);
};

// Each line belongs to the route, independently of the ark's position, heading,
// speed and encounter time. Fighters inherit their carrier's station and leash.
export const defenseArrivals = function (state: State, count: number): Arrival[] {
	const line = state.wave;
	const distance = lineDistance(state.systems.routeLength, line, count);
	const encounter = ENCOUNTERS[line - 1];
	if (!encounter) return [];
	return Array.from({ length: encounter.count }, function (_, i): Arrival {
		const kind = encounter.kind;
		const side = i % 2 === 0 ? -1 : 1;
		const anchor = {
			x: state.routeOrigin.x + distance + tactical((i % 3 - 1) * 25),
			y: state.routeOrigin.y + side * tactical(100 + i % 3 * 25),
		};
		return { at: state.time, kind, ...anchor, defense: { anchor, side, distance, disengaged: false } };
	});
};
