import { Box3, Ray, Vector3 } from 'three';
import { DECK_HEIGHT, FLIGHT_HEIGHT, TURRET_HEIGHT } from './projection';
import { type Effect, type Point, type Shot, type State } from './simulation';
import { arkVelocity, localPoint, worldPoint } from './space';

export interface Trajectory {
	readonly from: Point;
	readonly to: Point;
	readonly startHeight: number;
	readonly endHeight: number;
}

// Altitude belongs to presentation; shot positions and their recorded firing
// origins belong to the world even after their source has moved or turned.
export const createTrajectory = function (shot: Shot, state: State): Trajectory {
	if (shot.beamFrom) return { from: shot.beamFrom, to: { x: shot.x, y: shot.y }, startHeight: TURRET_HEIGHT, endHeight: FLIGHT_HEIGHT };
	// Simulation rounds start with four seconds of life. Rewind their movement,
	// rather than associating a fast round with a hardpoint it has already passed.
	const age = Math.max(0, 4 - shot.life);
	const launch = shot.origin ?? { x: shot.x - shot.vx * age, y: shot.y - shot.vy * age };
	if (shot.side === 'enemy') {
		const escort = state.escorts.find(function (candidate) { return candidate.id === shot.target; });
		if (shot.target !== undefined) return { from: launch, to: escort ? { x: escort.x, y: escort.y } : { x: shot.x + shot.vx, y: shot.y + shot.vy }, startHeight: FLIGHT_HEIGHT + (shot.originHeight ?? 0), endHeight: FLIGHT_HEIGHT };
		// Predict the deck boundary in the moving ark's frame, then put the
		// intersection back on the projectile's independent world trajectory.
		const local = localPoint(state, shot); const velocity = arkVelocity(state);
		const dx = shot.vx - velocity.x; const dy = shot.vy - velocity.y;
		const cosine = Math.cos(state.ark.angle); const sine = Math.sin(state.ark.angle);
		const relative = new Vector3(dx * cosine + dy * sine, 0, -dx * sine + dy * cosine);
		const speed = relative.length();
		const ray = new Ray(new Vector3(local.x, 0, local.y), relative.clone().normalize());
		const inside = Math.abs(local.x) < 145 && Math.abs(local.y) < 40;
		const hit = inside ? ray.origin : speed > 0 ? ray.intersectBox(new Box3(new Vector3(-145, -1, -40), new Vector3(145, 1, 40)), new Vector3()) : null;
		const time = hit && speed > 0 ? hit.distanceTo(ray.origin) / speed : 0;
		const impact = hit ? inside ? worldPoint(state, local) : { x: shot.x + shot.vx * time, y: shot.y + shot.vy * time } : { x: shot.x + shot.vx, y: shot.y + shot.vy };
		return { from: launch, to: impact, startHeight: FLIGHT_HEIGHT + (shot.originHeight ?? 0), endHeight: hit ? DECK_HEIGHT : FLIGHT_HEIGHT };
	}
	const target = state.enemies.find(function (candidate) { return candidate.id === shot.target; });
	return { from: launch, to: target ? { x: target.x, y: target.y } : { x: shot.x + shot.vx * 0.3, y: shot.y + shot.vy * 0.3 }, startHeight: shot.weapon === 'escort' ? FLIGHT_HEIGHT + (shot.originHeight ?? 0) : TURRET_HEIGHT, endHeight: FLIGHT_HEIGHT };
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
