import { Box3, Ray, Vector3 } from 'three';
import { DECK_HEIGHT, FLIGHT_HEIGHT, TURRET_HEIGHT } from './projection';
import { distance, type Effect, type Point, type Shot, type State } from './simulation';

export interface Trajectory {
	readonly from: Point;
	readonly to: Point;
	readonly startHeight: number;
	readonly endHeight: number;
}

const nearest = function (point: Point, candidates: readonly Point[]): Point {
	let closest: Point = point;
	let best = Infinity;
	for (const candidate of candidates) { const d = distance(point, candidate); if (d < best) { best = d; closest = candidate; } }
	return { x: closest.x, y: closest.y };
};

// Altitude belongs to presentation. Gameplay continues to use its unchanged
// ground-plane shots, hits and ranges; this track only joins the visible actors.
export const createTrajectory = function (shot: Shot, state: State): Trajectory {
	if (shot.beamFrom) return { from: shot.beamFrom, to: { x: shot.x, y: shot.y }, startHeight: TURRET_HEIGHT, endHeight: FLIGHT_HEIGHT };
	// Simulation rounds start with four seconds of life. Rewind their movement,
	// rather than associating a fast round with a hardpoint it has already passed.
	const age = Math.max(0, 4 - shot.life);
	const launch = { x: shot.x - shot.vx * age, y: shot.y - shot.vy * age };
	if (shot.side === 'enemy') {
		const escort = state.escorts.find(function (candidate) { return candidate.id === shot.target; });
		if (escort) return { from: launch, to: { x: escort.x, y: escort.y }, startHeight: FLIGHT_HEIGHT, endHeight: FLIGHT_HEIGHT };
		// Match the simulation's first hull collision, not its interior aim point.
		const ray = new Ray(new Vector3(launch.x, 0, launch.y), new Vector3(shot.vx, 0, shot.vy).normalize());
		const hit = Math.abs(launch.x) < 145 && Math.abs(launch.y) < 40 ? ray.origin : ray.intersectBox(new Box3(new Vector3(-145, -1, -40), new Vector3(145, 1, 40)), new Vector3());
		return { from: launch, to: hit ? { x: hit.x, y: hit.z } : { x: shot.x + shot.vx, y: shot.y + shot.vy }, startHeight: FLIGHT_HEIGHT, endHeight: hit ? DECK_HEIGHT : FLIGHT_HEIGHT };
	}
	const target = state.enemies.find(function (candidate) { return candidate.id === shot.target; });
	// Homing rounds can turn after launch; snap their rewound estimate to a pad.
	const from = shot.weapon === 'missile' ? nearest(launch, state.mounts.filter(function (mount) { return mount.weapon === shot.weapon; })) : launch;
	return { from, to: target ? { x: target.x, y: target.y } : { x: shot.x + shot.vx * 0.3, y: shot.y + shot.vy * 0.3 }, startHeight: shot.weapon === 'escort' ? FLIGHT_HEIGHT : TURRET_HEIGHT, endHeight: FLIGHT_HEIGHT };
};

export const projectileHeight = function (point: Point, trajectory: Trajectory, target: Point = trajectory.to): number {
	const dx = target.x - trajectory.from.x;
	const dy = target.y - trajectory.from.y;
	const lengthSquared = dx * dx + dy * dy;
	const progress = lengthSquared > 0 ? ((point.x - trajectory.from.x) * dx + (point.y - trajectory.from.y) * dy) / lengthSquared : 1;
	const fraction = Math.max(0, Math.min(1, progress));
	return trajectory.startHeight + (trajectory.endHeight - trajectory.startHeight) * fraction;
};

export const effectHeight = function (effect: Effect, state: State): number {
	if (effect.sourceShot) {
		// Interdiction stores the 2D round at impact; altitude remains presentation-only.
		// Escort-bound rounds stay on the flight layer even if the escort has since died.
		if (effect.sourceShot.target !== undefined) return FLIGHT_HEIGHT;
		return projectileHeight(effect, createTrajectory(effect.sourceShot, state));
	}
	// These are the existing simulation's Aegis and hull-impact visual signatures.
	return effect.color === '#88f1e4' || (effect.color === '#ff897e' && effect.radius === 22) ? DECK_HEIGHT : FLIGHT_HEIGHT;
};
