import { clamp, distance, targetFor, type Point, type Ship, type Side, type State } from './simulation';
import { cameraFor, worldToScreen, type Camera } from './projection';
import { drawStarship, polygon, line } from './ship-art';
import { createBackdrop } from './backdrop';

const ring = function (ctx: CanvasRenderingContext2D, at: Point, radius: number, color: string) {
	ctx.beginPath(); ctx.ellipse(at.x, at.y, radius, radius * 0.58, 0, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
};
const label = function (ctx: CanvasRenderingContext2D, value: string, at: Point, color: string, size = 10) {
	ctx.font = `500 ${size}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(value, at.x, at.y);
};
const drawFiringSolution = function (ctx: CanvasRenderingContext2D, camera: Camera, state: State, side: Side) {
	const target = targetFor(state, side); if (!target) return;
	const ready = state.batteries[side].reload === 0 && !state.player.braced;
	const at = worldToScreen(target, camera); const r = target.length * camera.scale * 0.7;
	ring(ctx, at, r, ready ? '#eacb8980' : '#85a9ae50');
};
const drawRadar = function (ctx: CanvasRenderingContext2D, width: number, state: State) {
	if (width < 720) return;
	const x = width - 92; const y = 165; const radius = 59;
	ctx.fillStyle = '#0c1c2bb3'; ctx.beginPath(); ctx.arc(x, y, radius + 12, 0, Math.PI * 2); ctx.fill();
	for (const r of [30, 60]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.strokeStyle = '#39566160'; ctx.stroke(); }
	line(ctx, { x: x - radius, y }, { x: x + radius, y }, '#39566140'); line(ctx, { x, y: y - radius }, { x, y: y + radius }, '#39566140');
	for (const enemy of state.enemies) {
		const dx = (enemy.x - state.player.x) / 15; const dy = (enemy.y - state.player.y) / 15;
		const factor = Math.min(1, radius / Math.max(1, Math.hypot(dx, dy)));
		ctx.fillStyle = enemy.warning > 0 ? '#ffd292' : '#dd8d81'; ctx.fillRect(x + dx * factor - 2, y + dy * factor - 2, 4, 4);
	}
	const p = state.player; const direction = p.angle;
	polygon(ctx, [{ x: x + Math.cos(direction) * 8, y: y + Math.sin(direction) * 8 },
		{ x: x + Math.cos(direction + 2.5) * 5, y: y + Math.sin(direction + 2.5) * 5 },
		{ x: x + Math.cos(direction - 2.5) * 5, y: y + Math.sin(direction - 2.5) * 5 }], '#b0ddd4');
	label(ctx, 'TACTICAL / 900 M', { x, y: y + 85 }, '#718b99', 8);
};
export const createRenderer = function () {
	const backdrop = createBackdrop();
	return function (ctx: CanvasRenderingContext2D, width: number, height: number, state: State, reducedMotion: boolean, briefing = false, zoom = 1) {
		if (width <= 0 || height <= 0) return;
		const camera = cameraFor(width, height, state.player, zoom);
		backdrop(ctx, width, height, camera);
		if (briefing) {
			if (width > 900) {
				const heroCamera = { ...camera, width: width * 1.46, height: height * 1.1, scale: Math.min(width / 520, height / 300, 3.1) };
				drawStarship(ctx, heroCamera, state.player, state);
				label(ctx, 'CSV–07  /  DREADWAKE', { x: width * 0.73, y: height * 0.76 }, '#a2c9da', 12);
				label(ctx, '42,000 T   ·   HEAVY COMMAND CRUISER', { x: width * 0.73, y: height * 0.76 + 23 }, '#637f97', 9);
			}
			return;
		}
		ctx.save();
		if (!reducedMotion) ctx.translate(Math.sin(state.time * 83) * state.shake, Math.cos(state.time * 71) * state.shake * 0.6);
		const p = state.player; const grid = 200;
		for (let i = -7; i <= 7; i++) {
			const x = Math.floor(p.x / grid) * grid + i * grid; const y = Math.floor(p.y / grid) * grid + i * grid;
			line(ctx, worldToScreen({ x, y: p.y - 1600 }, camera), worldToScreen({ x, y: p.y + 1600 }, camera), '#49728608');
			line(ctx, worldToScreen({ x: p.x - 1600, y }, camera), worldToScreen({ x: p.x + 1600, y }, camera), '#49728608');
		}
		for (let i = 0; i < 20; i++) {
			const at = worldToScreen({ x: Math.sin(i * 7.2) * 2600, y: Math.cos(i * 3.1) * 2600 }, camera, -80 - i % 3 * 10);
			const r = (8 + i % 4 * 8) * camera.scale;
			polygon(ctx, [{ x: at.x - r, y: at.y }, { x: at.x, y: at.y - r * 0.4 }, { x: at.x + r * 0.7, y: at.y + r * 0.3 }, { x: at.x, y: at.y + r * 0.6 }], '#172938', '#29404c');
		}
		drawFiringSolution(ctx, camera, state, 'port'); drawFiringSolution(ctx, camera, state, 'starboard');
		// Course prediction deliberately preserves current velocity instead of snapping to the bow.
		for (let i = 1; i < 10; i++) {
			const at = worldToScreen({ x: p.x + p.vx * i * 0.5, y: p.y + p.vy * i * 0.5 }, camera);
			ctx.fillStyle = '#a5dbce45'; ctx.fillRect(at.x - 1, at.y - 1, 2, 2);
		}
		for (const enemy of state.enemies) if (enemy.warning > 0) {
			const at = worldToScreen(enemy, camera, 20); const aim = worldToScreen(enemy.aim, camera);
			ctx.setLineDash([6, 8]); line(ctx, at, aim, '#eb8f7450'); ctx.setLineDash([]);
			ring(ctx, aim, (35 + enemy.warning * 40) * camera.scale, '#ed987a95');
			label(ctx, 'INCOMING', { x: aim.x, y: aim.y + 30 * camera.scale }, '#eaa184', 9);
		}
		for (const wreck of state.wrecks) {
			ctx.globalAlpha = Math.min(0.55, wreck.life / 12);
			const ship: Ship = { ...wreck, id: -1, hp: 0, maxHp: 1, vx: 0, vy: 0 };
			drawStarship(ctx, camera, ship, state); ctx.globalAlpha = 1;
		}
		const ships: Ship[] = [...state.enemies, p];
		ships.sort(function (a, b) { return a.x + a.y - b.x - b.y; });
		for (const ship of ships) {
			drawStarship(ctx, camera, ship, state);
			const at = worldToScreen(ship, camera, 65);
			if (ship.id === 0) {
				label(ctx, state.shield.active > 0 ? 'AEGIS FIELD ACTIVE' : p.braced ? 'ARMOR LOCK / −65%' : 'DREADWAKE', at, p.braced ? '#f0c482' : '#89bdce', 9);
			} else {
				const priority = ship.id === state.priorityTarget;
				label(ctx, `${priority ? '◆ ' : ''}${ship.length > 150 ? 'CRUISER' : 'FRIGATE'} ${String(ship.id).padStart(2, '0')}`, at, priority ? '#f3ce8b' : '#e0a2ae', 9);
				line(ctx, { x: at.x - 23, y: at.y + 9 }, { x: at.x + 23, y: at.y + 9 }, '#473547', 2);
				line(ctx, { x: at.x - 23, y: at.y + 9 }, { x: at.x - 23 + ship.hp / ship.maxHp * 46, y: at.y + 9 }, '#f197a5', 2);
				if (priority) {
					const center = worldToScreen(ship, camera, 15); const r = Math.max(20, ship.length * camera.scale * 0.65);
					for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
						line(ctx, { x: center.x + sx * r, y: center.y + sy * r * 0.6 }, { x: center.x + sx * (r - 8), y: center.y + sy * r * 0.6 }, '#f3ce8b', 1.5);
						line(ctx, { x: center.x + sx * r, y: center.y + sy * r * 0.6 }, { x: center.x + sx * r, y: center.y + sy * (r * 0.6 - 8) }, '#f3ce8b', 1.5);
					}
				}
			}
		}
		for (const shell of state.shells) {
			const at = worldToScreen(shell, camera, 22);
			const tail = worldToScreen({ x: shell.x - shell.vx * 0.085, y: shell.y - shell.vy * 0.085 }, camera, 22);
			line(ctx, tail, at, shell.hostile ? '#ff6c8b90' : '#77edff90', shell.hostile ? 2 : 3);
			ctx.fillStyle = shell.hostile ? '#ffc0cf' : '#d6ffff'; ctx.beginPath(); ctx.arc(at.x, at.y, shell.hostile ? 2 : 2.8, 0, Math.PI * 2); ctx.fill();
		}
		for (const fx of state.effects) {
			const progress = 1 - fx.life / fx.duration; const at = worldToScreen(fx, camera, 23);
			const r = (fx.kind === 'explosion' ? 100 : fx.kind === 'impact' ? 28 : 21) * camera.scale;
			ctx.globalAlpha = 1 - progress;
			ctx.beginPath(); ctx.arc(at.x, at.y, r * (0.15 + progress), 0, Math.PI * 2); ctx.fillStyle = fx.kind === 'muzzle' || fx.kind === 'shield' ? '#9ef5ff70' : '#e89d6950'; ctx.fill();
			ctx.strokeStyle = fx.kind === 'shield' || fx.kind === 'muzzle' ? '#b5faff' : '#ffca8a'; ctx.stroke();
			for (let i = 0; i < 7; i++) {
				const theta = i * 2.4; const spread = r * progress * 1.8;
				line(ctx, { x: at.x + Math.cos(theta) * spread * 0.5, y: at.y + Math.sin(theta) * spread * 0.5 },
					{ x: at.x + Math.cos(theta) * spread, y: at.y + Math.sin(theta) * spread }, '#f2c58c', 2);
			}
			if (fx.kind === 'explosion') {
				// A shock front and deterministic fragments make kills legible at battle scale.
				ring(ctx, at, r * (0.3 + progress * 2), '#ffc8a580');
				for (let i = 0; i < 12; i++) {
					const theta = i * 2.399; const spread = r * progress * (0.8 + i % 4 * 0.3);
					const x = at.x + Math.cos(theta) * spread; const y = at.y + Math.sin(theta) * spread * 0.6;
					polygon(ctx, [{ x, y }, { x: x + 5 * camera.scale, y: y - 3 * camera.scale }, { x: x + 8 * camera.scale, y: y + 2 * camera.scale }], '#c49682');
				}
			}
			ctx.globalAlpha = 1;
		}
		ctx.restore();
		for (const enemy of state.enemies) {
			const at = worldToScreen(enemy, camera);
			const safeTop = height < 500 ? 70 : 100;
			const compact = height <= 500 && width >= 540;
			const safeBottom = height - (compact ? 130 : width <= 700 ? 245 : 225);
			if (at.x > 45 && at.x < width - 45 && at.y > safeTop && at.y < safeBottom) continue;
			const dx = at.x - width / 2; const dy = at.y - height * 0.45;
			const fit = Math.min((width / 2 - 35) / Math.max(1, Math.abs(dx)), (height * 0.45 - safeTop - 10) / Math.max(1, Math.abs(dy)));
			const x = width / 2 + dx * fit; const y = clamp(height * 0.45 + dy * fit, safeTop + 5, safeBottom);
			const angle = Math.atan2(dy, dx);
			polygon(ctx, [0, 2.5, -2.5].map(function (offset) { return { x: x + Math.cos(angle + offset) * 8, y: y + Math.sin(angle + offset) * 8 }; }), '#d89480');
			label(ctx, `${Math.round(distance(p, enemy))} M`, { x, y: y + 20 }, '#bb8e80', 8);
		}
		if (height > 520) drawRadar(ctx, width, state);
	};
};
