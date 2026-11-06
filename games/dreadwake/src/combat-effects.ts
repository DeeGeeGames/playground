import { worldToScreen, type Camera } from './projection';
import { clamp, type Point, type State } from './simulation';
import { CEL } from './visual-theme';

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
export const drawCombatEffects = function (ctx: CanvasRenderingContext2D, camera: Camera, state: State, reducedMotion: boolean): void {
	ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]);
	const scale = clamp(camera.scale, 0.5, 1.8);
	for (const beam of state.beams) {
		const from = worldToScreen(beam.from, camera, 22); const to = worldToScreen(beam.to, camera, 22);
		ctx.globalAlpha = clamp(beam.life / 0.03, 0, 1);
		stroke(ctx, from, to, CEL.ink, 10 * scale);
		stroke(ctx, from, to, beam.hostile ? CEL.violet : CEL.mint, 6.5 * scale);
		stroke(ctx, from, to, CEL.cream, 2 * scale);
	}
	ctx.globalAlpha = 1;
	for (const shell of state.shells) {
		const at = worldToScreen(shell, camera, 22);
		const missile = shell.projectile === 'missile';
		const torpedo = shell.projectile === 'torpedo' || (shell.guidance !== undefined && !missile);
		const tail = worldToScreen({ x: shell.x - shell.vx * (missile ? 0.24 : torpedo ? 0.18 : 0.07), y: shell.y - shell.vy * (missile ? 0.24 : torpedo ? 0.18 : 0.07) }, camera, 22);
		const color = shell.hostile ? CEL.hostile : CEL.amber;
		stroke(ctx, tail, at, CEL.ink, (torpedo ? 5 : 3.8) * scale);
		stroke(ctx, tail, at, missile ? CEL.muted : color, (torpedo ? 2.8 : 1.8) * scale);
		if (!missile && !torpedo) {
			stroke(ctx, { x: (tail.x + at.x) / 2, y: (tail.y + at.y) / 2 }, at, CEL.cream, scale);
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
		if (effect.kind === 'shield') {
			const radius = (16 + motion * 24) * scale;
			ctx.beginPath(); ctx.ellipse(at.x, at.y, radius, radius * 0.62, 0, 0, Math.PI * 2);
			ctx.strokeStyle = CEL.ink; ctx.lineWidth = 5 * scale; ctx.stroke();
			ctx.strokeStyle = CEL.mint; ctx.lineWidth = 2.5 * scale; ctx.stroke();
			continue;
		}
		const explosion = effect.kind === 'explosion'; const intercept = effect.kind === 'intercept';
		const radius = (explosion ? 55 : intercept ? 8 : effect.kind === 'muzzle' ? 10 : 18) * scale * (0.6 + motion * 0.8);
		burst(ctx, at, radius, intercept ? CEL.mint : explosion ? CEL.hostile : CEL.amber, explosion ? 9 : 6, 0.2);
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
	ctx.restore();
};
