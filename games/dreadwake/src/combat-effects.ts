import { worldToScreen, type Camera } from './projection';
import { clamp, localPoint, type Point, type Shell, type State } from './simulation';
import { CEL } from './visual-theme';
import { MOUNT_SOCKETS, WEAPONS, weaponStats } from './weapons';

const stroke = function (ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string, width: number) {
	ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
	ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
};
const burst = function (ctx: CanvasRenderingContext2D, at: Point, radius: number, fill: string, points = 7, phase = 0) {
	ctx.beginPath();
	for (let i = 0; i < points * 2; i++) {
		const angle = i / points * Math.PI + phase;
		const r = radius * (i % 2 === 0 ? 1 : 0.48);
		const x = at.x + Math.cos(angle) * r; const y = at.y + Math.sin(angle) * r;
		if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
	}
	ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = CEL.ink; ctx.lineWidth = 1.8; ctx.stroke();
};

// One effect vocabulary keeps weapons identical in WebGL and fallback mode.
// Reduced motion retains projectile paths and danger information but removes
// decorative shock-front expansion and outward fragment movement.
export const createCombatEffectsRenderer = function () {
	// Trails belong to this view, not the deterministic simulation. Weak keys
	// release their short histories automatically when a projectile disappears.
	const trails = new WeakMap<Shell, { time: number; points: Point[] }>();
	return function (ctx: CanvasRenderingContext2D, camera: Camera, state: State, reducedMotion: boolean): void {
	ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]);
	const scale = clamp(camera.scale, 0.5, 1.8);
	for (const mount of state.arsenal?.mounts ?? []) {
		if (!mount || mount.weapon !== 'helios' || mount.charge <= 0) continue;
		const socket = MOUNT_SOCKETS[mount.slot]; if (!socket) continue;
		const stats = weaponStats(mount.weapon, mount.rank); const progress = clamp(mount.charge / stats.chargeTime, 0, 1);
		const origin = localPoint(state.player, socket.forward, socket.across);
		const from = worldToScreen(origin, camera, 32); const angle = mount.locked ? mount.lockHeading : mount.heading;
		const reach = mount.locked ? stats.range : Math.min(stats.range, 110 + progress * 100);
		const to = worldToScreen({ x: origin.x + Math.cos(angle) * reach, y: origin.y + Math.sin(angle) * reach }, camera, 32);
		const radius = (6 + progress * 13) * scale;
		ctx.setLineDash(mount.locked ? [11 * scale, 4 * scale] : [3 * scale, 8 * scale]);
		stroke(ctx, from, to, mount.locked ? WEAPONS.helios.color : `${WEAPONS.helios.color}75`, mount.locked ? 2.2 * scale : scale);
		ctx.setLineDash([]);
		ctx.beginPath(); ctx.arc(from.x, from.y, radius, 0, Math.PI * 2); ctx.fillStyle = `${WEAPONS.helios.color}22`; ctx.fill();
		ctx.strokeStyle = CEL.ink; ctx.lineWidth = 4 * scale; ctx.stroke();
		ctx.beginPath(); ctx.arc(from.x, from.y, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
		ctx.strokeStyle = WEAPONS.helios.color; ctx.lineWidth = 2.5 * scale; ctx.stroke();
		burst(ctx, from, (3 + progress * 5) * scale, mount.locked ? CEL.cream : WEAPONS.helios.color, 4, 0);
	}
	for (const beam of state.beams) {
		const from = worldToScreen(beam.from, camera, 28); const to = worldToScreen(beam.to, camera, 28);
		ctx.globalAlpha = clamp(beam.life / (beam.weaponId ? 0.08 : 0.03), 0, 1);
		const color = beam.hostile ? CEL.violet : beam.weaponId ? WEAPONS[beam.weaponId].color : CEL.mint;
		if (beam.weaponId === 'ion') {
			const dx = to.x - from.x; const dy = to.y - from.y; const length = Math.max(1, Math.hypot(dx, dy));
			const points = Array.from({ length: 9 }, function (_, i) {
				const offset = i === 0 || i === 8 ? 0 : (i % 2 === 0 ? -1 : 1) * Math.min(5 * scale, length * 0.05);
				return { x: from.x + dx * i / 8 - dy / length * offset, y: from.y + dy * i / 8 + dx / length * offset };
			});
			for (const [paint, width] of [[CEL.ink, 5], [color, 2.4]] as const) {
				ctx.beginPath(); ctx.moveTo(from.x, from.y); for (const point of points) ctx.lineTo(point.x, point.y);
				ctx.strokeStyle = paint; ctx.lineWidth = width * scale; ctx.stroke();
			}
		} else {
			const width = beam.weaponId === 'helios' ? 11 : beam.weaponId === 'spark' ? 2.8 : 6.5;
			stroke(ctx, from, to, CEL.ink, (width + 3) * scale);
			stroke(ctx, from, to, color, width * scale);
			stroke(ctx, from, to, CEL.cream, (beam.weaponId === 'helios' ? 3 : beam.weaponId === 'spark' ? 0.9 : 2) * scale);
		}
	}
	ctx.globalAlpha = 1;
	for (const shell of state.shells) {
		const at = worldToScreen(shell, camera, 22);
		const missile = shell.projectile === 'missile';
		const torpedo = shell.projectile === 'torpedo' || (shell.guidance !== undefined && !missile);
		const trailSeconds = missile ? 0.24 : torpedo ? 0.18 : shell.weaponId === 'rattler' ? 0.014 : shell.weaponId === 'rail' ? 0.095 : 0.045;
		const tail = worldToScreen({ x: shell.x - shell.vx * trailSeconds, y: shell.y - shell.vy * trailSeconds }, camera, 22);
		const color = shell.hostile ? CEL.hostile : shell.weaponId ? WEAPONS[shell.weaponId].color : CEL.amber;
		if (missile) {
			const trail = trails.get(shell) ?? { time: -1, points: [] };
			if (state.time !== trail.time) {
				trail.time = state.time; trail.points.push({ x: shell.x, y: shell.y });
				if (trail.points.length > 12) trail.points.shift(); trails.set(shell, trail);
			}
			ctx.beginPath(); let first = true;
			for (const point of trail.points) {
				const projected = worldToScreen(point, camera, 22);
				if (first) { ctx.moveTo(projected.x, projected.y); first = false; } else ctx.lineTo(projected.x, projected.y);
			}
			ctx.strokeStyle = `${color}85`; ctx.lineWidth = 1.5 * scale; ctx.stroke();
		}
		stroke(ctx, tail, at, CEL.ink, (torpedo ? 5 : shell.weaponId === 'rail' ? 4.6 : 3) * scale);
		stroke(ctx, tail, at, missile ? CEL.muted : color, (torpedo ? 2.8 : shell.weaponId === 'rail' ? 2.2 : 1.3) * scale);
		if (!missile && !torpedo) {
			stroke(ctx, { x: (tail.x + at.x) / 2, y: (tail.y + at.y) / 2 }, at, CEL.cream, scale);
			if (shell.weaponId === 'flak') burst(ctx, at, 3.3 * scale, color, 4, 0.3);
			continue;
		}
		ctx.save(); ctx.translate(at.x, at.y); ctx.rotate(Math.atan2(at.y - tail.y, at.x - tail.x));
		const length = (torpedo ? 13 : 9) * scale; const halfWidth = (torpedo ? 3 : 2.2) * scale;
		ctx.beginPath(); ctx.moveTo(length * 0.45, 0); ctx.lineTo(-length * 0.2, -halfWidth);
		ctx.lineTo(-length * 0.65, -halfWidth); ctx.lineTo(-length * 0.5, 0);
		ctx.lineTo(-length * 0.65, halfWidth); ctx.lineTo(-length * 0.2, halfWidth); ctx.closePath();
		ctx.fillStyle = shell.hostile ? CEL.hostile : CEL.top; ctx.fill(); ctx.strokeStyle = CEL.ink; ctx.lineWidth = Math.max(1, 1.5 * scale); ctx.stroke();
		stroke(ctx, { x: -length * 0.55, y: 0 }, { x: -length, y: 0 }, color, 2 * scale);
		ctx.restore();
	}
	for (const trace of state.pointDefense.traces) {
		ctx.globalAlpha = clamp(trace.life / 0.16, 0, 1);
		const from = worldToScreen(trace.from, camera, 28); const to = worldToScreen(trace.to, camera, 22);
		stroke(ctx, from, to, CEL.ink, 3 * scale); stroke(ctx, from, to, CEL.mint, 1.4 * scale);
	}
	for (const effect of state.effects) {
		const progress = clamp(1 - effect.life / effect.duration, 0, 1);
		const at = worldToScreen(effect, camera, 24);
		const motion = reducedMotion ? 0.35 : progress;
		ctx.globalAlpha = (1 - progress) * (reducedMotion ? 0.75 : 1);
		if (effect.radius !== undefined && effect.radius > 0) {
			const radius = effect.radius * camera.scale; const color = effect.weaponId ? WEAPONS[effect.weaponId].color : CEL.amber;
			// This perimeter always shows the actual hit area. Decorative expansion
			// stays inside it, and reduced motion preserves the same boundary.
			ctx.beginPath(); ctx.ellipse(at.x, at.y, radius, radius / Math.sqrt(3), 0, 0, Math.PI * 2);
			ctx.fillStyle = `${color}15`; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.6 * scale; ctx.stroke();
			const front = radius * (reducedMotion ? 0.55 : 0.2 + progress * 0.75);
			ctx.beginPath(); ctx.ellipse(at.x, at.y, front, front / Math.sqrt(3), 0, 0, Math.PI * 2);
			ctx.strokeStyle = CEL.cream; ctx.lineWidth = 1.2 * scale; ctx.stroke();
		}
		if (effect.kind === 'shield') {
			const radius = (16 + motion * 24) * scale;
			ctx.beginPath(); ctx.ellipse(at.x, at.y, radius, radius * 0.62, 0, 0, Math.PI * 2);
			ctx.strokeStyle = CEL.ink; ctx.lineWidth = 5 * scale; ctx.stroke();
			ctx.strokeStyle = CEL.mint; ctx.lineWidth = 2.5 * scale; ctx.stroke();
			continue;
		}
		const explosion = effect.kind === 'explosion'; const intercept = effect.kind === 'intercept';
		const radius = (explosion ? 55 : intercept ? 8 : effect.kind === 'muzzle' ? 10 : 18) * scale * (0.6 + motion * 0.8);
		const weaponColor = effect.weaponId ? WEAPONS[effect.weaponId].color : CEL.amber;
		burst(ctx, at, radius, intercept ? CEL.mint : explosion ? CEL.hostile : weaponColor, explosion ? 9 : effect.weaponId === 'flak' ? 8 : 6, 0.2);
		burst(ctx, at, radius * 0.56, CEL.cream, explosion ? 7 : 5, 0.1);
		if (explosion) {
			ctx.beginPath(); ctx.ellipse(at.x, at.y, radius * 1.45, radius * 0.8, 0, 0, Math.PI * 2);
			ctx.strokeStyle = CEL.amber; ctx.lineWidth = 2 * scale; ctx.stroke();
		}
		if (!reducedMotion && (explosion || effect.kind === 'impact')) {
			for (let i = 0; i < (explosion ? 8 : 3); i++) {
				const angle = i * 2.399; const spread = radius * (0.8 + progress * 1.5);
				const x = at.x + Math.cos(angle) * spread; const y = at.y + Math.sin(angle) * spread * 0.7;
				ctx.beginPath(); ctx.moveTo(x, y - 3 * scale); ctx.lineTo(x + 5 * scale, y); ctx.lineTo(x, y + 3 * scale); ctx.lineTo(x - 3 * scale, y); ctx.closePath();
				ctx.fillStyle = explosion ? CEL.side : CEL.amber; ctx.fill(); ctx.strokeStyle = CEL.ink; ctx.lineWidth = 1; ctx.stroke();
			}
		}
	}
	for (const enemy of state.enemies) {
		if ((enemy.slowRemaining ?? 0) <= 0) continue;
		const at = worldToScreen(enemy, camera, 18); const radius = enemy.length * camera.scale * 0.6;
		ctx.globalAlpha = 0.7; ctx.setLineDash([5 * scale, 7 * scale]);
		ctx.beginPath(); ctx.ellipse(at.x, at.y, radius, radius / Math.sqrt(3), 0, 0, Math.PI * 2);
		ctx.strokeStyle = WEAPONS.ion.color; ctx.lineWidth = 1.6 * scale; ctx.stroke(); ctx.setLineDash([]);
	}
	ctx.restore();
	};
};
