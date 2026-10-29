import { angleDelta, distance, type EnemyKind, type Point, type State } from './simulation';

interface Body extends Point { angle: number }
export interface Foot extends Point { lift: number; angle: number }
type FootIndex = 0 | 1;
interface Swing { index: FootIndex; from: Foot; elapsed: number; duration: number }
export interface WalkerGait {
	body: Body;
	feet: readonly [Foot, Foot];
	swing: Swing | undefined;
	nextFoot: FootIndex;
}
export interface Gaits { player: WalkerGait; enemies: ReadonlyMap<number, WalkerGait>; time: number }
interface Joint extends Point { z: number }

const clamp = function (value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); };
const mix = function (from: number, to: number, t: number) { return from + (to - from) * t; };
export const mechScale = function (kind: EnemyKind) { return kind === 'scout' ? 0.8 : kind === 'siege' ? 1.15 : 1; };
const restFoot = function (body: Body, index: FootIndex, size: number): Foot {
	const side = index === 0 ? -1 : 1;
	return {
		x: body.x + Math.cos(body.angle) * 7 * size - Math.sin(body.angle) * side * 23 * size,
		y: body.y + Math.sin(body.angle) * 7 * size + Math.cos(body.angle) * side * 23 * size,
		angle: body.angle, lift: 0,
	};
};
export const createGait = function (body: Body, size = 1): WalkerGait {
	return { body: { ...body }, feet: [restFoot(body, 0, size), restFoot(body, 1, size)], swing: undefined, nextFoot: 0 };
};

// Presentation advances on simulation steps, never render frames. Stance feet
// retain their world position AND heading while the hull passes over them.
export const advanceGait = function (gait: WalkerGait, actualBody: Body, dt: number, size = 1): WalkerGait {
	if (dt <= 0) return gait;
	if (distance(gait.body, actualBody) > 80 * size) return createGait(actualBody, size);
	// AI aim can change instantly on a target switch. Let the visible hull turn
	// through that change without rotating either planted foot with it.
	const body: Body = { x: actualBody.x, y: actualBody.y, angle: gait.body.angle + clamp(angleDelta(gait.body.angle, actualBody.angle), -dt * 2.5, dt * 2.5) };
	const dx = (body.x - gait.body.x) / dt; const dy = (body.y - gait.body.y) / dt;
	const turn = angleDelta(gait.body.angle, body.angle) / dt;
	const speed = Math.hypot(dx, dy) + Math.abs(turn) * 23 * size;
	let swing = gait.swing;
	if (!swing && speed > 0.1) {
		const preferred = gait.nextFoot;
		const other = preferred === 0 ? 1 : 0;
		const index = distance(gait.feet[preferred], restFoot(body, preferred, size)) > 10 * size ? preferred : other;
		if (distance(gait.feet[index], restFoot(body, index, size)) > 10 * size) {
			swing = { index, from: gait.feet[index], elapsed: 0, duration: clamp(26 * size / speed, 0.22, 0.65) };
		}
	}
	if (!swing) return { ...gait, body: { ...body } };
	const elapsed = Math.min(swing.duration, swing.elapsed + dt);
	const progress = elapsed / swing.duration;
	// Predict touchdown from actual translation and turning. Re-evaluating this
	// during swing lets reversing and braking redirect the airborne foot.
	const lead = swing.duration - elapsed + swing.duration * 0.4;
	const target = restFoot({ x: body.x + dx * lead, y: body.y + dy * lead, angle: body.angle + turn * lead }, swing.index, size);
	const eased = progress * progress * (3 - 2 * progress);
	const foot: Foot = {
		x: mix(swing.from.x, target.x, eased), y: mix(swing.from.y, target.y, eased),
		angle: swing.from.angle + angleDelta(swing.from.angle, target.angle) * eased,
		lift: progress === 1 ? 0 : Math.sin(progress * Math.PI) ** 2 * 10 * size,
	};
	return {
		body: { ...body }, feet: swing.index === 0 ? [foot, gait.feet[1]] : [gait.feet[0], foot],
		swing: progress === 1 ? undefined : { ...swing, elapsed },
		nextFoot: swing.index === 0 ? 1 : 0,
	};
};

// Two fixed-length links, with the knee's pole pointing behind the hull.
export const legJoints = function (body: Body, foot: Foot, index: FootIndex, size = 1) {
	const side = index === 0 ? -1 : 1;
	const hip: Joint = {
		x: body.x - Math.cos(body.angle) * 2 * size - Math.sin(body.angle) * side * 18 * size,
		y: body.y - Math.sin(body.angle) * 2 * size + Math.cos(body.angle) * side * 18 * size, z: 48 * size,
	};
	const ankle: Joint = { x: foot.x - Math.cos(foot.angle) * 5 * size, y: foot.y - Math.sin(foot.angle) * 5 * size, z: 10 * size + foot.lift };
	const dx = ankle.x - hip.x; const dy = ankle.y - hip.y; const dz = ankle.z - hip.z;
	const length = Math.hypot(dx, dy, dz);
	const ux = dx / length; const uy = dy / length; const uz = dz / length;
	const dot = -Math.cos(body.angle) * ux - Math.sin(body.angle) * uy;
	const px = -Math.cos(body.angle) - dot * ux; const py = -Math.sin(body.angle) - dot * uy; const pz = -dot * uz;
	const poleLength = Math.hypot(px, py, pz);
	const upper = 30 * size; const lower = 34 * size;
	const along = clamp((upper ** 2 - lower ** 2 + length ** 2) / (2 * length), -upper, upper);
	const bend = Math.sqrt(Math.max(0, upper ** 2 - along ** 2));
	const knee: Joint = { x: hip.x + ux * along + px / poleLength * bend, y: hip.y + uy * along + py / poleLength * bend, z: hip.z + uz * along + pz / poleLength * bend };
	return { hip, knee, ankle };
};

export const createGaits = function (state: State): Gaits {
	return { player: createGait(state.player), enemies: new Map(state.enemies.map(function (enemy) { return [enemy.id, createGait(enemy, mechScale(enemy.kind))]; })), time: state.time };
};
export const advanceGaits = function (gaits: Gaits, state: State): Gaits {
	const dt = state.time - gaits.time;
	if (dt < 0) return createGaits(state);
	if (dt === 0) return gaits;
	return {
		player: advanceGait(gaits.player, state.player, dt), time: state.time,
		enemies: new Map(state.enemies.map(function (enemy) {
			const size = mechScale(enemy.kind);
			return [enemy.id, advanceGait(gaits.enemies.get(enemy.id) ?? createGait(enemy, size), enemy, dt, size)];
		})),
	};
};
