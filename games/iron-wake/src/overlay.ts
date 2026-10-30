import type { OrthographicCamera } from 'three';
import { mechScale, type Gaits } from './gait';
import { toScreen } from './projection-3d';
import { ARENA, distance, type Point, type State } from './simulation';

export interface OverlayOptions {
	reducedMotion: boolean;
	showRadar: boolean;
	gaits: Gaits;
	camera: OrthographicCamera;
}

export const edgeMarker = function (point: Point, width: number, height: number): { point: Point; angle: number } | undefined {
	const left = Math.min(45, width / 2); const right = width - left;
	const top = Math.min(80, height / 2); const bottom = Math.max(top, height - 130);
	if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) return undefined;
	const origin = { x: width / 2, y: Math.max(top, Math.min(bottom, height * 0.52)) };
	const dx = point.x - origin.x; const dy = point.y - origin.y;
	const horizontal = dx > 0 ? (right - origin.x) / dx : dx < 0 ? (left - origin.x) / dx : Infinity;
	const vertical = dy > 0 ? (bottom - origin.y) / dy : dy < 0 ? (top - origin.y) / dy : Infinity;
	const factor = Math.max(0, Math.min(horizontal, vertical));
	return { point: { x: origin.x + dx * factor, y: origin.y + dy * factor }, angle: Math.atan2(dy, dx) };
};

// This canvas carries labels and tactical UI only. World surfaces and effects
// use the scene's depth buffer; labels follow the exact active camera matrix.
export const drawOverlay = function (ctx: CanvasRenderingContext2D, width: number, height: number, state: State, aim: Point, options: OverlayOptions) {
	ctx.clearRect(0, 0, width, height);
	if (width <= 0 || height <= 0) return;
	ctx.save();
	const at = function (point: Point, elevation = 0) { return toScreen(point, options.camera, width, height, elevation); };
	const ground = at(state.player); const above = at(state.player, 1);
	const scale = Math.hypot(above.x - ground.x, above.y - ground.y);
	const text = function (content: string, point: Point, elevation: number, color: string, size = 10, offsetY = 0) {
		const anchor = at(point, elevation);
		ctx.font = `${size * scale}px monospace`; ctx.textAlign = 'center'; ctx.fillStyle = color;
		ctx.fillText(content, anchor.x, anchor.y + offsetY * scale);
	};
	const relay = { x: ARENA.relayX, y: ARENA.relayY };
	text('RELAY 09', relay, 165, '#b6d6d2');
	for (const warning of state.warnings) text('INBOUND', warning, 10, '#f3ae7f', 10, -20);
	for (const salvage of state.salvage) {
		const bob = options.reducedMotion ? 0 : Math.sin(state.time * 2) * 2;
		text(salvage.kind === 'repair' ? '+' : '❄', salvage, 30 + bob, salvage.kind === 'repair' ? '#82dfbb' : '#8bdcec');
	}
	for (const enemy of state.enemies) {
		if (enemy.hp >= enemy.maxHp) continue;
		const anchor = at(enemy, 105 * mechScale(enemy.kind));
		ctx.fillStyle = '#0a151b'; ctx.fillRect(anchor.x - 22 * scale, anchor.y, 44 * scale, 4 * scale);
		ctx.fillStyle = '#df9d7b'; ctx.fillRect(anchor.x - 22 * scale, anchor.y, 44 * Math.max(0, enemy.hp) / enemy.maxHp * scale, 4 * scale);
	}
	const target = state.enemies.reduce<State['enemies'][number] | undefined>(function (nearest, enemy) {
		return !nearest || distance(enemy, aim) < distance(nearest, aim) ? enemy : nearest;
	}, undefined);
	if (target && distance(target, aim) < 80) {
		const anchor = at(target, 42);
		ctx.strokeStyle = '#f6b574'; ctx.lineWidth = 1.5 * scale;
		ctx.strokeRect(anchor.x - 30 * scale, anchor.y - 40 * scale, 60 * scale, 65 * scale);
		text(target.kind.toUpperCase(), target, 42, '#ffcb93', 9, -49);
	}
	for (const enemy of state.enemies) {
		const marker = edgeMarker(at(enemy, 40), width, height); if (!marker) continue;
		ctx.save(); ctx.translate(marker.point.x, marker.point.y); ctx.rotate(marker.angle);
		ctx.fillStyle = '#eead7c'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill(); ctx.restore();
	}
	if (options.showRadar) {
		const w = 144; const h = 96; const x = width - w - 24; const y = 92;
		ctx.fillStyle = '#081721bb'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#6c929355'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
		const dot = function (point: Point, color: string, radius: number) {
			ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + point.x / ARENA.width * w, y + point.y / ARENA.height * h, radius, 0, Math.PI * 2); ctx.fill();
		};
		dot(relay, '#83dad7', 3); dot(state.player, '#edf1dd', 3);
		for (const enemy of state.enemies) dot(enemy, '#f0a273', enemy.kind === 'siege' ? 3 : 2);
		for (const warning of state.warnings) dot(warning, '#f0a27388', 4);
		ctx.font = '8px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#94b1b8'; ctx.fillText('TACTICAL / 1.8 × 1.2 KM', x + 8, y + h + 15);
	}
	const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.2, width / 2, height / 2, Math.max(width, height) * 0.7);
	vignette.addColorStop(0, '#03101a00'); vignette.addColorStop(1, '#03101a99'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
	ctx.restore();
};
