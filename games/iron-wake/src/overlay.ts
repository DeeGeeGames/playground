import type { OrthographicCamera } from 'three';
import { mechScale, type Gaits } from './gait';
import { toScreen } from './projection-3d';
import { ARENA, distance, getEnemyDefense, type Point, type State } from './simulation';

export interface ScreenRect { left: number; right: number; top: number; bottom: number }
export interface OverlayOptions {
	obstructions?: readonly ScreenRect[];
	reducedMotion: boolean;
	showRadar: boolean;
	gaits: Gaits;
	camera: OrthographicCamera;
	couchMode?: boolean;
	armorHit?: number;
	relayHit?: number;
}

export const edgeMarker = function (point: Point, width: number, height: number, obstructions: readonly ScreenRect[] = []): { point: Point; angle: number } | undefined {
	const left = Math.min(45, width / 2); const right = width - left;
	const top = Math.min(80, height / 2); const bottom = Math.max(top, height - 130);
	const padded = obstructions.map(function (rect) { return { left: rect.left - 18, right: rect.right + 18, top: rect.top - 32, bottom: rect.bottom + 18 }; });
	if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom && !padded.some(function (rect) { return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom; })) return undefined;
	const preferred = { x: width / 2, y: Math.max(top, Math.min(bottom, height * 0.52)) };
	const blocked = function (candidate: Point) { return padded.some(function (rect) { return candidate.x >= rect.left && candidate.x <= rect.right && candidate.y >= rect.top && candidate.y <= rect.bottom; }); };
	const origins = [preferred, ...padded.map(function (rect) { return { x: preferred.x, y: Math.max(top, Math.min(bottom, rect.top - 1)) }; }), { x: preferred.x, y: top }];
	const origin = origins.find(function (candidate) { return !blocked(candidate); });
	if (!origin) return undefined;
	const dx = point.x - origin.x; const dy = point.y - origin.y;
	if (dx === 0 && dy === 0) return undefined;
	const horizontal = dx > 0 ? (right - origin.x) / dx : dx < 0 ? (left - origin.x) / dx : Infinity;
	const vertical = dy > 0 ? (bottom - origin.y) / dy : dy < 0 ? (top - origin.y) / dy : Infinity;
	let factor = Math.max(0, Math.min(horizontal, vertical));
	for (const rect of padded) {
		if ((dx === 0 && (origin.x < rect.left || origin.x > rect.right)) || (dy === 0 && (origin.y < rect.top || origin.y > rect.bottom))) continue;
		const tx = dx === 0 ? [-Infinity, Infinity] : [(rect.left - origin.x) / dx, (rect.right - origin.x) / dx];
		const ty = dy === 0 ? [-Infinity, Infinity] : [(rect.top - origin.y) / dy, (rect.bottom - origin.y) / dy];
		const entry = Math.max(Math.min(...tx), Math.min(...ty));
		const exit = Math.min(Math.max(...tx), Math.max(...ty));
		if (entry > 0 && entry <= exit) factor = Math.min(factor, entry);
	}
	return { point: { x: origin.x + dx * factor, y: origin.y + dy * factor }, angle: Math.atan2(dy, dx) };
};

const bracket = function (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, length: number) {
	ctx.beginPath();
	for (const horizontal of [-1, 1]) for (const vertical of [-1, 1]) {
		const px = x + horizontal * width / 2; const py = y + vertical * height / 2;
		ctx.moveTo(px - horizontal * length, py); ctx.lineTo(px, py); ctx.lineTo(px, py - vertical * length);
	}
	ctx.stroke();
};

// World labels use the same projection as ground picking and the 3D scene.
// Tactical diagrams remain screen-space, so they stay legible while moving.
export const drawOverlay = function (ctx: CanvasRenderingContext2D, width: number, height: number, state: State, aim: Point, options: OverlayOptions) {
	ctx.clearRect(0, 0, width, height);
	if (width <= 0 || height <= 0) return;
	ctx.save();
	const at = function (point: Point, elevation = 0) { return toScreen(point, options.camera, width, height, elevation); };
	const ground = at(state.player); const above = at(state.player, 1);
	const scale = Math.hypot(above.x - ground.x, above.y - ground.y);
	const minimumText = options.couchMode ? 16 : width > 700 ? 13 : 11;
	const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.3, width / 2, height / 2, Math.max(width, height) * 0.7);
	vignette.addColorStop(0, '#07141900'); vignette.addColorStop(1, '#0714198c'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
	if ((options.armorHit ?? 0) > 0) {
		ctx.save(); ctx.globalAlpha = Math.min(0.55, options.armorHit ?? 0);
		ctx.strokeStyle = '#ff9b7a'; ctx.lineWidth = options.reducedMotion ? 3 : 7;
		ctx.strokeRect(2, 2, width - 4, height - 4); ctx.restore();
	}
	const text = function (content: string, point: Point, elevation: number, color: string, size = 10, offsetY = 0) {
		const anchor = at(point, elevation);
		const fontSize = Math.max(minimumText, size * scale); const y = anchor.y + offsetY * scale;
		ctx.font = `600 ${fontSize}px monospace`; ctx.textAlign = 'center';
		const length = ctx.measureText(content).width;
		ctx.fillStyle = '#0b171cdb'; ctx.fillRect(anchor.x - length / 2 - 4, y - fontSize, length + 8, fontSize + 5);
		ctx.fillStyle = color; ctx.fillText(content, anchor.x, y);
	};
	const relay = { x: ARENA.relayX, y: ARENA.relayY };
	text((options.relayHit ?? 0) > 0 ? 'UPLINK UNDER FIRE' : 'UPLINK / 09', relay, 206, (options.relayHit ?? 0) > 0 || state.relay < 30 ? '#ffac83' : '#aee2d5', 10);
	if ((options.armorHit ?? 0) > 0) text('ARMOR HIT', state.player, 124, '#ffb697', 12);
	const relayLabel = at(relay, 196);
	ctx.fillStyle = '#112329dd'; ctx.fillRect(relayLabel.x - 31, relayLabel.y, 62, 3);
	ctx.fillStyle = state.relay < 30 ? '#f49769' : '#9bccbc'; ctx.fillRect(relayLabel.x - 31, relayLabel.y, 62 * state.relay / 100, 3);
	for (const warning of state.warnings) text(warning.commander ? 'COMMAND SIGNAL' : 'INBOUND', warning, 10, '#f3bd80', 10, -20);
	for (const [index, strike] of state.strikes.entries()) {
		if (state.strikes.some(function (other, otherIndex) { return otherIndex !== index && distance(other, strike) < 12 && (other.life < strike.life || other.life === strike.life && otherIndex < index); })) continue;
		text(`IMPACT ${strike.life.toFixed(1)}`, strike, 8, '#ffd2a6', 11, -14);
	}
	for (const salvage of state.salvage) {
		const bob = options.reducedMotion ? 0 : Math.sin(state.time * 2) * 2;
		text(salvage.kind === 'repair' ? '+ REPAIR' : 'COOLANT', salvage, 38 + bob, salvage.kind === 'repair' ? '#b2f4c9' : '#a2e8f2', 9);
	}
	const target = state.enemies.reduce<State['enemies'][number] | undefined>(function (nearest, enemy) {
		return !nearest || distance(enemy, aim) < distance(nearest, aim) ? enemy : nearest;
	}, undefined);
	const selected = target && distance(target, aim) < 80 ? target : undefined;
	for (const enemy of state.enemies) {
		const defense = getEnemyDefense(state, enemy);
		if (enemy.hp >= enemy.maxHp && enemy !== selected && !enemy.commander && !defense.exposed) continue;
		const labelHeight = (enemy.commander ? 152 : enemy.kind === 'siege' ? 126 : 112) * mechScale(enemy.kind);
		const anchor = at(enemy, labelHeight);
		const barWidth = enemy.commander ? options.couchMode ? 100 : 76 : options.couchMode ? 56 : 42;
		ctx.fillStyle = '#0a151be6'; ctx.fillRect(anchor.x - barWidth / 2 - 1, anchor.y - 1, barWidth + 2, 5);
		ctx.fillStyle = enemy.commander ? '#f3ad7e' : '#dfaa82'; ctx.fillRect(anchor.x - barWidth / 2, anchor.y, barWidth * Math.max(0, enemy.hp) / enemy.maxHp, 3);
		if (enemy.commander) text(defense.enraged ? 'IRON CROWN / OVERDRIVE' : 'IRON CROWN', enemy, labelHeight, '#ffd5a5', 11, -(minimumText + 6) / scale);
		if (enemy.attack) {
			const label = defense.exposed ? `EXPOSED ${enemy.attack.remaining.toFixed(1)}s` : 'BARRAGE COMMITTED';
			text(label, enemy, labelHeight, defense.exposed ? '#adf7d7' : '#ffd5a5', 11, -(enemy.commander ? minimumText * 2 + 15 : minimumText + 6) / scale);
		}
	}
	if (selected) {
		const anchor = at(selected, 50 * mechScale(selected.kind));
		const size = (selected.commander ? 90 : 74) * scale;
		ctx.strokeStyle = '#f3c37d'; ctx.lineWidth = 1.5;
		bracket(ctx, anchor.x, anchor.y, size, size, 10);
		const inRange = distance(selected, state.player) <= 900;
		const defense = getEnemyDefense(state, selected);
		const role = selected.commander ? 'COMMAND FRAME' : selected.kind === 'siege' ? defense.exposed ? 'SIEGE / EXPOSED' : 'SIEGE / FLANK ARMOR' : selected.kind.toUpperCase();
		text(role, selected, 42, '#ffe1aa', 10, 48);
		text(`${Math.round(distance(selected, state.player))} M / ${inRange ? 'MISSILE LOCK' : 'NO LOCK'}`, selected, 42, inRange ? '#ebc184' : '#98a8a7', 8, 48 + (minimumText + 7) / scale);
	}
	// A precise sight remains useful when aiming ahead of a moving contact.
	const cursor = at(aim, 0);
	ctx.strokeStyle = selected ? '#f6c77c' : '#d9e5d1'; ctx.lineWidth = 1;
	bracket(ctx, cursor.x, cursor.y, 15, 15, 4);
	ctx.fillStyle = '#f1e9c7'; ctx.fillRect(cursor.x - 1, cursor.y - 1, 2, 2);
	const marker = function (point: Point, color: string, label?: string) {
		const edge = edgeMarker(at(point, 40), width, height, options.obstructions); if (!edge) return;
		ctx.save(); ctx.translate(edge.point.x, edge.point.y); ctx.rotate(edge.angle);
		ctx.fillStyle = '#0b1c23dd'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
		ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, -4); ctx.lineTo(-2, 0); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill(); ctx.restore();
		if (label) { ctx.font = `${minimumText}px monospace`; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(label, edge.point.x, edge.point.y + 26); }
	};
	for (const enemy of state.enemies) marker(enemy, enemy.commander ? '#ffd3a3' : '#eead7c');
	for (const warning of state.warnings) marker(warning, '#d29b66');
	marker(relay, '#a3ddd0', 'UPLINK');
	if (options.showRadar) {
		const w = options.couchMode ? 208 : 174; const h = options.couchMode ? 136 : 116; const x = width - w - 26; const y = 112;
		ctx.fillStyle = '#0c1c22e6'; ctx.fillRect(x - 1, y - 24, w + 2, h + 49);
		ctx.strokeStyle = '#91ada445'; ctx.lineWidth = 1; ctx.strokeRect(x - 1, y - 24, w + 2, h + 49);
		ctx.strokeStyle = '#8fa39c30'; ctx.strokeRect(x + 6, y + 4, w - 12, h - 8);
		ctx.font = `600 ${options.couchMode ? 14 : 11}px monospace`; ctx.textAlign = 'left'; ctx.fillStyle = '#c5d0bc'; ctx.fillText('TACTICAL', x + 9, y - 8);
		ctx.textAlign = 'right'; ctx.fillStyle = '#829c99'; ctx.fillText('N ↑', x + w - 8, y - 8);
		ctx.strokeStyle = '#64847e22'; ctx.lineWidth = 7;
		ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
		ctx.strokeStyle = '#6c8b8433'; ctx.lineWidth = 1;
		ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 20, 0, Math.PI * 2); ctx.stroke();
		const point = function (value: Point) { return { x: x + value.x / ARENA.width * w, y: y + value.y / ARENA.height * h }; };
		const dot = function (value: Point, color: string, radius: number, outline = false) {
			const at = point(value); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 1;
			ctx.beginPath(); ctx.arc(at.x, at.y, radius, 0, Math.PI * 2); if (outline) ctx.stroke(); else ctx.fill();
		};
		ctx.save(); ctx.beginPath(); ctx.rect(x + 1, y + 1, w - 2, h - 2); ctx.clip();
		dot(relay, '#91c5b8', 4, true);
		const p = point(state.player); const a = point(aim);
		ctx.strokeStyle = '#c9d9c04d'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(a.x, a.y); ctx.stroke();
		ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(state.player.angle);
		ctx.fillStyle = '#f1e4b9'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-3, -3); ctx.lineTo(-1, 0); ctx.lineTo(-3, 3); ctx.closePath(); ctx.fill(); ctx.restore();
		for (const enemy of state.enemies) dot(enemy, enemy.commander ? '#ffd6a7' : '#f2a571', enemy.commander ? 4 : enemy.kind === 'siege' ? 3 : 2);
		for (const warning of state.warnings) dot(warning, '#e5a46f', 4, true);
		for (const salvage of state.salvage) dot(salvage, salvage.kind === 'repair' ? '#83bba2' : '#86b6c1', 1.5);
		for (const strike of state.strikes) dot(strike, '#ff8154', strike.radius / ARENA.width * w, true);
		ctx.restore();
		ctx.font = `${options.couchMode ? 14 : 11}px monospace`; ctx.textAlign = 'left'; ctx.fillStyle = '#91a9a3'; ctx.fillText(`${state.enemies.length.toString().padStart(2, '0')} CONTACTS`, x + 9, y + h + 15);
	}
	ctx.restore();
};
