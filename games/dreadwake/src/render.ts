import { clamp, distance, targetFor, torpedoTargetFor, type Point, type Ship, type Side, type State } from './simulation';
import { cameraFor, worldToScreen, type Camera } from './projection';
import { drawStarship, polygon, line } from './ship-art';
import { createBackdrop } from './backdrop';
import { createCombatEffectsRenderer } from './combat-effects';
import { hudObstacles, clearLabelPosition } from './tactical-labels';
import { CEL } from './visual-theme';

const ring = function (ctx: CanvasRenderingContext2D, at: Point, radius: number, color: string) {
	ctx.beginPath(); ctx.ellipse(at.x, at.y, radius, radius * 0.58, 0, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
};
const contactOnField = function (point: Point, width: number, height: number) {
	const safeTop = height < 500 ? 70 : 100;
	const compact = height <= 500 && width >= 540;
	const safeBottom = height - (compact ? 180 : width <= 700 ? 300 : 280);
	return point.x > 45 && point.x < width - 45 && point.y > safeTop && point.y < safeBottom;
};
const label = function (ctx: CanvasRenderingContext2D, value: string, at: Point, color: string, size = 10) {
	ctx.font = `700 ${size}px Arial, sans-serif`; ctx.textAlign = 'center';
	const width = ctx.measureText(value).width; const view = ctx.canvas.getBoundingClientRect();
	const position = clearLabelPosition({ x: at.x, y: at.y - size / 2 }, width + 8, size + 6, hudObstacles(ctx.canvas), view.width, view.height); if (!position) return;
	ctx.fillStyle = CEL.hud; ctx.fillRect(position.x - width / 2 - 4, position.y - size / 2 - 2, width + 8, size + 6);
	ctx.fillStyle = color; ctx.fillText(value, position.x, position.y + size / 2);
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
	ctx.fillStyle = CEL.hud; ctx.beginPath(); ctx.arc(x, y, radius + 12, 0, Math.PI * 2); ctx.fill();
	for (const r of [30, 60]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.strokeStyle = CEL.dark; ctx.stroke(); }
	line(ctx, { x: x - radius, y }, { x: x + radius, y }, CEL.dark); line(ctx, { x, y: y - radius }, { x, y: y + radius }, CEL.dark);
	for (const enemy of state.enemies) {
		const dx = (enemy.x - state.player.x) / 15; const dy = (enemy.y - state.player.y) / 15;
		const factor = Math.min(1, radius / Math.max(1, Math.hypot(dx, dy)));
		ctx.fillStyle = enemy.warning > 0 ? CEL.amber : CEL.hostile; ctx.fillRect(x + dx * factor - 2, y + dy * factor - 2, 4, 4);
	}
	const p = state.player; const direction = p.angle;
	polygon(ctx, [{ x: x + Math.cos(direction) * 8, y: y + Math.sin(direction) * 8 },
		{ x: x + Math.cos(direction + 2.5) * 5, y: y + Math.sin(direction + 2.5) * 5 },
		{ x: x + Math.cos(direction - 2.5) * 5, y: y + Math.sin(direction - 2.5) * 5 }], CEL.mint);
	label(ctx, 'TACTICAL / 900 M', { x, y: y + 85 }, CEL.muted, 8);
};
const drawHeading = function (ctx: CanvasRenderingContext2D, camera: Camera, player: Ship, heading: number) {
	const origin = worldToScreen(player, camera, 20);
	const projected = worldToScreen({ x: player.x + Math.cos(heading), y: player.y + Math.sin(heading) }, camera, 20);
	const direction = Math.atan2(projected.y - origin.y, projected.x - origin.x);
	const length = Math.min(camera.width * 0.32, camera.height * 0.28, Math.max(110, 240 * camera.scale));
	const at = { x: origin.x + Math.cos(direction) * length, y: origin.y + Math.sin(direction) * length };
	ctx.save();
	ctx.setLineDash([5, 7]); ctx.lineWidth = 1.5;
	line(ctx, origin, at, `${CEL.mint}b3`); ctx.setLineDash([]);
	polygon(ctx, [0, 2.5, -2.5].map(function (offset) {
		return { x: at.x + Math.cos(direction + offset) * 10, y: at.y + Math.sin(direction + offset) * 10 };
	}), CEL.mint, CEL.ink);
	label(ctx, 'SET HEADING', { x: at.x, y: at.y - 18 }, CEL.mint, 9);
	ctx.restore();
};
export const createRenderer = function () {
	const backdrop = createBackdrop();
	const drawCombatEffects = createCombatEffectsRenderer();
	return function (ctx: CanvasRenderingContext2D, width: number, height: number, state: State, reducedMotion: boolean, briefing = false, zoom = 1, heading?: number) {
		if (width <= 0 || height <= 0) return;
		const camera = cameraFor(width, height, state.player, zoom);
		backdrop(ctx, width, height, camera);
		if (briefing) {
			if (width > 900) {
				const heroCamera = { ...camera, width: width * 1.46, height: height * 1.1, scale: Math.min(width / 520, height / 300, 3.1) };
				drawStarship(ctx, heroCamera, state.player, state, reducedMotion);
				label(ctx, 'CSV–07  /  DREADWAKE', { x: width * 0.73, y: height * 0.76 }, CEL.muted, 12);
				label(ctx, '42,000 T   ·   HEAVY COMMAND CRUISER', { x: width * 0.73, y: height * 0.76 + 23 }, CEL.side, 9);
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
			polygon(ctx, [{ x: at.x - r, y: at.y }, { x: at.x, y: at.y - r * 0.4 }, { x: at.x + r * 0.7, y: at.y + r * 0.3 }, { x: at.x, y: at.y + r * 0.6 }], CEL.planet, CEL.ink);
		}
		if (!state.arsenal) { drawFiringSolution(ctx, camera, state, 'port'); drawFiringSolution(ctx, camera, state, 'starboard'); }
		const torpedoTarget = state.arsenal ? undefined : torpedoTargetFor(state);
		if (torpedoTarget && state.torpedoes.reload === 0 && !p.braced) {
			const at = worldToScreen(torpedoTarget, camera);
			ring(ctx, at, torpedoTarget.length * camera.scale * 0.82, `${CEL.amber}99`);
			label(ctx, 'T / TORPEDO LOCK', { x: at.x, y: at.y + torpedoTarget.length * camera.scale * 0.55 + 14 }, CEL.amber, 9);
		}
		// Course prediction deliberately preserves current velocity instead of snapping to the bow.
		for (let i = 1; i < 10; i++) {
			const at = worldToScreen({ x: p.x + p.vx * i * 0.5, y: p.y + p.vy * i * 0.5 }, camera);
			ctx.fillStyle = '#a5dbce45'; ctx.fillRect(at.x - 1, at.y - 1, 2, 2);
		}
		for (const enemy of state.enemies) if (enemy.warning > 0) {
			const at = worldToScreen(enemy, camera, 20); const aim = worldToScreen(enemy.aim, camera);
			const beam = enemy.weapon === 'beam';
			ctx.setLineDash([6, 8]); line(ctx, at, aim, beam ? `${CEL.violet}b0` : `${CEL.hostile}90`); ctx.setLineDash([]);
			ring(ctx, aim, (35 + enemy.warning * 40) * camera.scale, beam ? CEL.violet : CEL.hostile);
		}
		for (const wreck of state.wrecks) {
			ctx.globalAlpha = Math.min(0.55, wreck.life / 12);
			const ship: Ship = { ...wreck, id: -1, hp: 0, maxHp: 1, vx: 0, vy: 0 };
			drawStarship(ctx, camera, ship, state, reducedMotion); ctx.globalAlpha = 1;
		}
		const ships: Ship[] = [...state.enemies, p];
		ships.sort(function (a, b) { return a.x + a.y - b.x - b.y; });
		for (const ship of ships) drawStarship(ctx, camera, ship, state, reducedMotion);
		for (const ship of ships) {
			const hull = worldToScreen(ship, camera, 20);
			const at = { x: hull.x, y: hull.y - Math.max(34, ship.length * camera.scale * 0.54) - 12 };
			if (ship.id === 0) {
				label(ctx, state.shield.active > 0 ? 'AEGIS FIELD ACTIVE' : p.braced ? 'ARMOR LOCK / −65%' : 'DREADWAKE', at, p.braced ? CEL.amber : CEL.mint, 9);
			} else {
				if (!contactOnField(worldToScreen(ship, camera), width, height)) continue;
				const priority = state.arsenal ? state.arsenal.mounts.some(function (mount) { return mount?.target === ship.id; }) : ship.id === state.priorityTarget;
				const contact = state.enemies.find(function (enemy) { return enemy.id === ship.id; });
				const designation = contact?.command ? 'COMMAND CRUISER' : ship.length > 150 ? 'CRUISER' : 'FRIGATE';
				label(ctx, `${priority ? '◆ ' : ''}${designation} ${String(ship.id).padStart(2, '0')}`, at, contact?.command || priority ? CEL.amber : CEL.hostile, 11);
				if (contact?.tactic) label(ctx, contact.tactic.toUpperCase(), { x: at.x, y: at.y - 17 }, CEL.muted, 10);
				line(ctx, { x: at.x - 23, y: at.y + 9 }, { x: at.x + 23, y: at.y + 9 }, '#473547', 2);
				line(ctx, { x: at.x - 23, y: at.y + 9 }, { x: at.x - 23 + ship.hp / ship.maxHp * 46, y: at.y + 9 }, CEL.hostile, 2);
				if (priority) {
					const center = worldToScreen(ship, camera, 15); const r = Math.max(20, ship.length * camera.scale * 0.65);
					for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
						line(ctx, { x: center.x + sx * r, y: center.y + sy * r * 0.6 }, { x: center.x + sx * (r - 8), y: center.y + sy * r * 0.6 }, CEL.amber, 1.5);
						line(ctx, { x: center.x + sx * r, y: center.y + sy * r * 0.6 }, { x: center.x + sx * r, y: center.y + sy * (r * 0.6 - 8) }, CEL.amber, 1.5);
					}
				}
			}
		}
		if (heading !== undefined) drawHeading(ctx, camera, p, heading);
		drawCombatEffects(ctx, camera, state, reducedMotion);
		for (const enemy of state.enemies) if (enemy.warning > 0) {
			const aim = worldToScreen(enemy.aim, camera);
			label(ctx, enemy.weapon === 'beam' ? 'LANCE CHARGING' : enemy.weapon === 'missile' ? 'MISSILE SALVO' : 'INCOMING', { x: aim.x, y: aim.y + Math.max(40, p.length * camera.scale * 0.5) }, enemy.weapon === 'beam' ? CEL.violet : CEL.hostile, 11);
		}
		ctx.restore();
		for (const enemy of state.enemies) {
			const at = worldToScreen(enemy, camera);
			const safeTop = height < 500 ? 70 : 100;
			const compact = height <= 500 && width >= 540;
			const safeBottom = height - (compact ? 180 : width <= 700 ? 300 : 280);
			if (contactOnField(at, width, height)) continue;
			const dx = at.x - width / 2; const dy = at.y - height * 0.45;
			const fit = Math.min((width / 2 - 35) / Math.max(1, Math.abs(dx)), (height * 0.45 - safeTop - 10) / Math.max(1, Math.abs(dy)));
			const x = width / 2 + dx * fit; const y = clamp(height * 0.45 + dy * fit, safeTop + 5, safeBottom);
			const angle = Math.atan2(dy, dx);
			polygon(ctx, [0, 2.5, -2.5].map(function (offset) { return { x: x + Math.cos(angle + offset) * 8, y: y + Math.sin(angle + offset) * 8 }; }), CEL.hostile);
			label(ctx, `${Math.round(distance(p, enemy))} M`, { x, y: y + 20 }, CEL.muted, 8);
		}
		if (height > 520) drawRadar(ctx, width, state);
	};
};
