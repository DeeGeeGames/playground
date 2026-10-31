import { contactIntel, SENSOR_CONFIG } from './sensors';
import type { EnemyKind, Point, State } from './simulation';
import { arkVelocity, flightVelocity, localPoint, worldPoint } from './space';

export const LOST_TRACK_SECONDS = 8;
export const RADAR_SHORT_RANGE = SENSOR_CONFIG.shortRange;
export const RADAR_LONG_RANGE = SENSOR_CONFIG.healthyDetectionRange;
type Classified = { readonly intel: 'classified'; readonly kind: EnemyKind; readonly hull: number; readonly maxHull: number };
type Unclassified = { readonly intel: 'detected' };
export type RadarContact = (Classified | Unclassified) & {
	readonly key: string;
	readonly ids: readonly number[];
	readonly point: Point;
	readonly range: number;
	readonly bearing: number;
	readonly closing: number | undefined;
	readonly entry: number | undefined;
	readonly age: number;
};
type Snapshot = (Classified | Unclassified) & { readonly id: number; readonly point: Point; readonly closing: number | undefined; readonly seen: number };

export const radarPoint = function (state: State, point: Point, range: number): Point {
	const local = localPoint(state, point);
	return { x: 220 + local.y / range * 180, y: 220 - local.x / range * 180 };
};
const coarsePoint = function (state: State, point: Point): Point {
	const local = localPoint(state, point);
	const bearing = Math.round(Math.atan2(local.y, local.x) / (Math.PI / 18)) * Math.PI / 18;
	const range = Math.max(100, Math.round(Math.hypot(local.x, local.y) / 100) * 100);
	return worldPoint(state, { x: Math.cos(bearing) * range, y: Math.sin(bearing) * range });
};
const closingSpeed = function (state: State, enemy: State['enemies'][number]): number | undefined {
	if (!enemy.flight) return undefined;
	const dx = enemy.x - state.ark.x; const dy = enemy.y - state.ark.y; const length = Math.hypot(dx, dy);
	if (length === 0) return 0;
	const ship = arkVelocity(state); const target = flightVelocity(enemy.flight);
	return -((target.x - ship.x) * dx + (target.y - ship.y) * dy) / length;
};

// Stores observations only. Lost contacts never query an unseen actor's position,
// health, type or velocity, even if that actor remains alive in the simulation.
export const createRadarTracker = function () {
	const snapshots = new Map<number, Snapshot>();
	let lastTime = 0;
	const reset = function () { snapshots.clear(); lastTime = 0; };
	const observe = function (state: State): readonly RadarContact[] {
		if (state.time < lastTime) reset();
		lastTime = state.time;
		for (const enemy of state.enemies) {
			if (enemy.hp <= 0) continue;
			const intel = contactIntel(state, enemy); if (intel === 'unseen') continue;
			const speed = closingSpeed(state, enemy);
			const common = { id: enemy.id, point: intel === 'classified' ? { x: enemy.x, y: enemy.y } : coarsePoint(state, enemy), closing: speed === undefined ? undefined : intel === 'classified' ? speed : Math.round(speed / 5) * 5, seen: state.time };
			snapshots.set(enemy.id, intel === 'classified' ? { ...common, intel, kind: enemy.kind, hull: enemy.hp, maxHull: enemy.maxHp } : { ...common, intel });
		}
		const contacts = new Map<string, RadarContact>();
		for (const [id, snapshot] of snapshots) {
			const age = state.time - snapshot.seen;
			if (age > LOST_TRACK_SECONDS) { snapshots.delete(id); continue; }
			const local = localPoint(state, snapshot.point); const range = Math.hypot(local.x, local.y);
			const bearing = (Math.atan2(local.y, local.x) * 180 / Math.PI + 360) % 360;
			const key = snapshot.intel === 'classified' ? `ship-${id}` : `group-${Math.round(bearing / 10) % 36}-${Math.round(range / 100)}-${age > 0 ? 'lost' : 'live'}`;
			const existing = contacts.get(key);
			if (existing) { contacts.set(key, { ...existing, ids: [...existing.ids, id], age: Math.max(existing.age, age) }); continue; }
			const entry = snapshot.closing !== undefined && snapshot.closing > 1 && range > RADAR_SHORT_RANGE ? (range - RADAR_SHORT_RANGE) / snapshot.closing : undefined;
			const common = { key, ids: [id], point: snapshot.point, range, bearing, closing: snapshot.closing, entry, age };
			contacts.set(key, snapshot.intel === 'classified' ? { ...common, intel: snapshot.intel, kind: snapshot.kind, hull: snapshot.hull, maxHull: snapshot.maxHull } : { ...common, intel: snapshot.intel });
		}
		return [...contacts.values()].sort(function (a, b) { return a.age - b.age || a.range - b.range; });
	};
	return { observe, reset };
};
