import { tactical } from './combat-scale';
import type { Arrival, EnemyKind, Point, State } from './simulation';

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
	const strength = [8, 11, 10, 17, 24, 16][line - 1] ?? 16;
	return Array.from({ length: strength }, function (_, i): Arrival {
		const kind: EnemyKind = line === count && i === 0 ? 'flagship' : line >= 3 && i % 5 === 0 ? 'armored' : line >= 2 && i % 3 === 0 ? 'bomber' : 'raider';
		const side = i % 2 === 0 ? -1 : 1;
		const anchor = {
			x: state.routeOrigin.x + distance + tactical((i % 3 - 1) * 25),
			y: state.routeOrigin.y + side * tactical(100 + i % 3 * 25),
		};
		return { at: state.time, kind, ...anchor, defense: { anchor, side, distance, disengaged: false } };
	});
};
