import { worldToScreen, type Camera } from './projection';
import { clamp, localPoint, type Point, type Shell, type State } from './simulation';
import { CEL } from './visual-theme';
import { WEAPONS, weaponStats } from './weapons';
import { muzzlePoint, projectilePoint, projectileVelocity, sampleTrail, shieldEnvelope, smooth, type TrailPoint } from './effect-motion';

const stroke = function (ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string, width: number) {
	ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
	ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
};
const puff = function (ctx: CanvasRenderingContext2D, at: Point, radius: number, color: string, aspect = 1) {
	ctx.save(); ctx.translate(at.x, at.y); ctx.scale(1, aspect);
	const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(0.1, radius));
	gradient.addColorStop(0, color); gradient.addColorStop(0.4, `${color}dc`); gradient.addColorStop(1, `${color}00`);
	ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(0, 0, Math.max(0.1, radius), 0, Math.PI * 2); ctx.fill(); ctx.restore();
};
const ring = function (ctx: CanvasRenderingContext2D, at: Point, radius: number, color: string, width: number, aspect = 0.62) {
	ctx.beginPath(); ctx.ellipse(at.x, at.y, radius, radius * aspect, 0, 0, Math.PI * 2);
	ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
};
interface Trail { points: TrailPoint[]; seconds: number; elevation: number; color: string; width: number; seen: number }

// Shared by WebGL and Canvas. Histories are world-space observations with a
// fixed lifetime, so turning, zooming and pausing cannot invent new trail paths.
export const createCombatEffectsRenderer = function () {
	const trails = new Map<Shell, Trail>(); let lastState: State | undefined; let lastTime = -1;
	return function (ctx: CanvasRenderingContext2D, camera: Camera, state: State, reducedMotion: boolean): void {
	if (state !== lastState || state.time < lastTime) trails.clear();
	lastState = state; lastTime = state.time;
	ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]);
	const scale = clamp(camera.scale, 0.5, 1.8);
	for (const mount of state.arsenal?.mounts ?? []) {
		if (!mount || mount.weapon !== 'helios' || mount.charge <= 0) continue;
		const stats = weaponStats(mount.weapon, mount.rank); const progress = clamp(mount.charge / stats.chargeTime, 0, 1);
		const angle = mount.locked ? mount.lockHeading : mount.heading;
		const origin = muzzlePoint(state.player, mount.slot, mount.weapon, angle);
		const from = worldToScreen(origin, camera, origin.elevation);
		const reach = mount.locked ? stats.range - 15 : 110 + progress * 100;
		const to = worldToScreen({ x: origin.x + Math.cos(angle) * reach, y: origin.y + Math.sin(angle) * reach }, camera, origin.elevation);
		ctx.setLineDash(mount.locked ? [11 * scale, 4 * scale] : [3 * scale, 8 * scale]);
		stroke(ctx, from, to, mount.locked ? WEAPONS.helios.color : `${WEAPONS.helios.color}75`, mount.locked ? 2 * scale : scale); ctx.setLineDash([]);
		const radius = (5 + smooth(progress) * 10) * scale;
		puff(ctx, from, radius * 1.2, WEAPONS.helios.color);
		ctx.beginPath(); ctx.arc(from.x, from.y, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
		ctx.strokeStyle = WEAPONS.helios.color; ctx.lineWidth = 1.8 * scale; ctx.stroke();
		puff(ctx, from, (2 + progress * 3) * scale, CEL.cream);
	}
	for (const beam of state.beams) {
		const elevation = beam.elevation ?? 28;
		const from = worldToScreen(beam.visualFrom ?? beam.from, camera, elevation); const to = worldToScreen(beam.to, camera, elevation);
		const duration = beam.weaponId === 'helios' ? 0.24 : beam.weaponId === 'ion' ? 0.16 : beam.weaponId === 'spark' ? 0.1 : 0.045;
		const energy = smooth(beam.life / duration); ctx.globalAlpha = energy;
		const color = beam.hostile ? CEL.violet : beam.weaponId ? WEAPONS[beam.weaponId].color : CEL.mint;
		if (beam.weaponId === 'ion') {
			const dx = to.x - from.x; const dy = to.y - from.y; const length = Math.max(1, Math.hypot(dx, dy));
			const amplitude = Math.min(3.5 * scale, length * 0.025) * (reducedMotion ? 0.5 : 0.65 + energy * 0.35);
			for (const [paint, width] of [[`${color}38`, 6], [color, 2], [CEL.cream, 0.65]] as const) {
				ctx.beginPath(); ctx.moveTo(from.x, from.y);
				for (let i = 1; i <= 4; i++) {
					const a = (i - 1) / 4; const b = i / 4; const offset = (i % 2 ? 1 : -1) * amplitude;
					ctx.bezierCurveTo(from.x + dx * (a + 0.08) - dy / length * offset, from.y + dy * (a + 0.08) + dx / length * offset,
						from.x + dx * (b - 0.08) - dy / length * offset, from.y + dy * (b - 0.08) + dx / length * offset, from.x + dx * b, from.y + dy * b);
				}
				ctx.strokeStyle = paint; ctx.lineWidth = width * scale; ctx.stroke();
			}
		} else {
			const width = (beam.weaponId === 'helios' ? 9 : beam.weaponId === 'spark' ? 2.6 : 5) * (0.6 + energy * 0.4);
			stroke(ctx, from, to, `${color}38`, (width + 5) * scale);
			stroke(ctx, from, to, color, width * scale); stroke(ctx, from, to, CEL.cream, width * 0.3 * scale);
		}
	}
	ctx.globalAlpha = 1;
	for (const shell of state.shells) {
		const guided = shell.projectile === 'missile' || shell.projectile === 'torpedo' || shell.guidance !== undefined;
		const seconds = guided ? shell.projectile === 'missile' ? 0.32 : 0.26 : shell.weaponId === 'rail' ? 0.095 : shell.weaponId === 'rattler' ? 0.025 : 0.06;
		const elevation = shell.launch?.elevation ?? 22;
		// Let the muzzle flash cover the few milliseconds inside a barrel. The
		// collider remains unchanged; no visual trail ever reaches behind its tip.
		const launch = shell.launch;
		if (launch && !launch.offset && state.time - launch.time < 0.15 && (shell.x - launch.point.x) * shell.vx + (shell.y - launch.point.y) * shell.vy < 0) continue;
		const color = shell.hostile ? CEL.hostile : shell.weaponId ? WEAPONS[shell.weaponId].color : CEL.amber;
		const trail = trails.get(shell) ?? { points: launch && state.time - launch.time <= 0.15 ? [{ ...launch.point, time: launch.time }] : [], seconds, elevation, color,
			width: guided ? 2.6 : shell.weaponId === 'rail' ? 2.4 : 1.5, seen: state.time };
		trail.points = sampleTrail(trail.points, projectilePoint(shell, state.time), state.time, seconds); trail.seen = state.time; trails.set(shell, trail);
	}
	for (const [shell, trail] of trails) {
		const fade = smooth(1 - (state.time - trail.seen) / trail.seconds);
		if (fade <= 0) { trails.delete(shell); continue; }
		const projected = trail.points.map(function (point) { return { ...worldToScreen(point, camera, trail.elevation), age: clamp(1 - (state.time - point.time) / trail.seconds, 0, 1) }; });
		const first = projected[0]; const last = projected.at(-1); if (!first || !last || projected.length < 2) continue;
		const sides = [-1, 1].map(function (sign) {
			return projected.map(function (point, i) {
				const before = projected[Math.max(0, i - 1)] ?? point; const after = projected[Math.min(projected.length - 1, i + 1)] ?? point;
				const dx = after.x - before.x; const dy = after.y - before.y; const length = Math.max(0.001, Math.hypot(dx, dy));
				const radius = trail.width * scale * 0.5 * point.age * sign;
				return { x: point.x - dy / length * radius, y: point.y + dx / length * radius };
			});
		});
		const outline = [...(sides[0] ?? []), ...(sides[1] ?? []).reverse()]; const start = outline[0]; if (!start) continue;
		const gradient = ctx.createLinearGradient(first.x, first.y, last.x + 0.001, last.y);
		gradient.addColorStop(0, `${trail.color}00`); gradient.addColorStop(1, trail.color);
		ctx.globalAlpha = fade * 0.85; ctx.beginPath(); ctx.moveTo(start.x, start.y);
		for (let i = 1; i < outline.length; i++) {
			const point = outline[i]; const next = outline[(i + 1) % outline.length]; if (!point || !next) continue;
			ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
		}
		ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
	}
	ctx.globalAlpha = 1;
	for (const shell of state.shells) {
		const trail = trails.get(shell); if (!trail) continue;
		const at = worldToScreen(projectilePoint(shell, state.time), camera, trail.elevation);
		const missile = shell.projectile === 'missile'; const torpedo = shell.projectile === 'torpedo' || (shell.guidance !== undefined && !missile);
		const point = projectilePoint(shell, state.time); const velocity = projectileVelocity(shell, state.time);
		const ahead = worldToScreen({ x: point.x + velocity.x, y: point.y + velocity.y }, camera, trail.elevation);
		ctx.save(); ctx.translate(at.x, at.y); ctx.rotate(Math.atan2(ahead.y - at.y, ahead.x - at.x));
		if (!missile && !torpedo) {
			stroke(ctx, { x: -2 * scale, y: 0 }, { x: 0, y: 0 }, CEL.cream, (shell.weaponId === 'flak' ? 2.4 : 1.5) * scale);
		} else {
			const length = (torpedo ? 11 : 7) * scale; const radius = (torpedo ? 2.3 : 1.6) * scale;
			puff(ctx, { x: -length * 0.65, y: 0 }, radius * 2.4, trail.color, 0.6);
			ctx.beginPath(); ctx.ellipse(-length * 0.15, 0, length * 0.5, radius, 0, 0, Math.PI * 2);
			ctx.fillStyle = shell.hostile ? CEL.hostile : CEL.top; ctx.fill(); ctx.strokeStyle = CEL.ink; ctx.lineWidth = scale; ctx.stroke();
		}
		ctx.restore();
	}
	for (const trace of state.pointDefense.traces) {
		ctx.globalAlpha = smooth(trace.life / 0.16);
		const from = worldToScreen(trace.from, camera, 28); const to = worldToScreen(trace.to, camera, 22);
		stroke(ctx, from, to, `${CEL.mint}40`, 3 * scale); stroke(ctx, from, to, CEL.mint, 1.2 * scale);
	}
	for (const effect of state.effects) {
		const progress = clamp(1 - effect.life / effect.duration, 0, 1); const expansion = 1 - Math.pow(1 - progress, 3);
		const source = effect.source;
		const fitted = source && 'slot' in source ? source : undefined;
		const hull = source && 'shipId' in source ? source : undefined;
		const ship = hull ? state.enemies.find(function (enemy) { return enemy.id === hull.shipId; }) : undefined;
		const mount = fitted ? state.arsenal?.mounts[fitted.slot] : undefined;
		const heading = mount ? mount.locked ? mount.lockHeading : mount.heading : source?.heading ?? 0;
		const origin = fitted && effect.weaponId ? muzzlePoint(state.player, fitted.slot, effect.weaponId, heading, reducedMotion ? 0 : Math.min(2.4, (mount?.flash ?? 0) * 15))
			: hull && ship ? { ...localPoint(ship, hull.forward, hull.across), elevation: hull.elevation } : { x: effect.x, y: effect.y, elevation: effect.elevation ?? 24 };
		const at = worldToScreen(origin, camera, origin.elevation);
		const motion = reducedMotion ? 0.3 : expansion;
		const opacity = smooth(1 - progress) * (reducedMotion ? 0.75 : 1); ctx.globalAlpha = opacity;
		const color = effect.weaponId ? WEAPONS[effect.weaponId].color : effect.kind === 'intercept' || effect.kind === 'shield' ? CEL.mint : CEL.amber;
		if (effect.radius !== undefined && effect.radius > 0) {
			const radius = effect.radius * camera.scale * Math.sqrt(1.5);
			// This boundary remains the exact gameplay radius throughout the burst.
			ring(ctx, at, radius, `${color}80`, 1.2 * scale, 1 / Math.sqrt(3));
			ring(ctx, at, radius * (0.18 + motion * 0.78), color, 1.5 * scale, 1 / Math.sqrt(3));
		}
		if (effect.kind === 'shield') {
			ring(ctx, at, (10 + motion * 25) * scale, CEL.mint, (2.5 - progress) * scale);
			puff(ctx, at, (8 + motion * 13) * scale, CEL.mint, 0.62); continue;
		}
		if (effect.kind === 'muzzle') {
			const angle = heading; const ahead = worldToScreen({ x: origin.x + Math.cos(angle), y: origin.y + Math.sin(angle) }, camera, origin.elevation);
			ctx.save(); ctx.translate(at.x, at.y); ctx.rotate(Math.atan2(ahead.y - at.y, ahead.x - at.x));
			const radius = (effect.weaponId === 'rattler' ? 4 : effect.weaponId === 'helios' ? 12 : 7) * scale * (1 - progress * 0.5);
			puff(ctx, { x: radius * 0.45, y: 0 }, radius, color, 0.55); puff(ctx, { x: radius * 0.2, y: 0 }, radius * 0.45, CEL.cream, 0.6); ctx.restore(); continue;
		}
		const explosion = effect.kind === 'explosion'; const intercept = effect.kind === 'intercept';
		const radius = (explosion ? effect.radius ? 22 : 48 : intercept ? 8 : 13) * scale * (0.3 + motion * 0.85);
		if (explosion) {
			for (let i = 0; i < 5; i++) {
				const angle = i * 2.399 + effect.x * 0.01; const phase = clamp((progress - i * 0.025) / (0.65 + i * 0.07), 0, 1);
				const spread = radius * (0.18 + motion * (0.55 + i % 2 * 0.24));
				ctx.globalAlpha = opacity * (1 - smooth(phase)) * (0.9 - i * 0.08);
				puff(ctx, { x: at.x + Math.cos(angle) * spread, y: at.y + Math.sin(angle) * spread * 0.7 - motion * i * 2 * scale },
					radius * (0.38 + i % 3 * 0.075), effect.weaponId ? color : i % 2 ? CEL.amber : CEL.hostile, 0.8);
			}
			ctx.globalAlpha = opacity * (1 - smooth(progress));
			ring(ctx, at, radius * (1 + motion * 0.5), color, (2 - progress) * scale);
		} else puff(ctx, at, radius, color, 0.8);
		ctx.globalAlpha = opacity * (1 - smooth(progress / 0.55)); puff(ctx, at, radius * 0.65, CEL.cream, 0.85); ctx.globalAlpha = opacity;
		if (!reducedMotion && (explosion || effect.kind === 'impact')) for (let i = 0; i < (explosion ? 7 : 3); i++) {
			const angle = i * 2.399 + effect.x * 0.01; const spread = radius * (0.6 + motion * 0.8);
			const direction = { x: Math.cos(angle), y: Math.sin(angle) * 0.7 };
			const point = { x: at.x + direction.x * spread, y: at.y + direction.y * spread };
			stroke(ctx, point, { x: point.x - direction.x * 3 * scale, y: point.y - direction.y * 3 * scale }, color, 1.5 * scale);
		}
	}
	ctx.globalAlpha = 1;
	if (state.shield.active > 0) {
		ctx.globalAlpha = shieldEnvelope(state.shield.active) * 0.75; ctx.beginPath();
		for (let i = 0; i <= 64; i++) {
			const angle = i / 64 * Math.PI * 2; const point = worldToScreen(localPoint(state.player, Math.cos(angle) * 155, Math.sin(angle) * 94), camera, 24);
			if (i === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
		}
		ctx.strokeStyle = CEL.mint; ctx.lineWidth = 1.8 * scale; ctx.stroke();
	}
	for (const enemy of state.enemies) {
		if ((enemy.slowRemaining ?? 0) <= 0) continue;
		const at = worldToScreen(enemy, camera, 18); const radius = enemy.length * camera.scale * 0.6;
		ctx.globalAlpha = smooth((enemy.slowRemaining ?? 0) / 0.3) * 0.6; ctx.setLineDash([5 * scale, 7 * scale]);
		ring(ctx, at, radius, WEAPONS.ion.color, 1.4 * scale); ctx.setLineDash([]);
	}
	ctx.restore();
	};
};
