import { localPoint, type Point, type Ship, type State } from './simulation';
import { worldToScreen, type Camera } from './projection';

export type Outline = readonly (readonly [number, number])[];
export const polygon = function (ctx: CanvasRenderingContext2D, points: readonly Point[], fill: string | CanvasGradient, stroke?: string) {
	const first = points[0]; if (!first) return;
	ctx.beginPath(); ctx.moveTo(first.x, first.y);
	for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
	ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
	if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.8; ctx.stroke(); }
};
export const line = function (ctx: CanvasRenderingContext2D, a: Point, b: Point, color: string, width = 1) {
	ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
};

// Closed pressure hulls and separate drive nacelles, with no exposed deck or bridge tower.
const spine: Outline = [[0.44, -0.12], [0.53, -0.05], [0.53, 0.05], [0.44, 0.12], [-0.43, 0.16], [-0.49, 0.09], [-0.49, -0.09], [-0.43, -0.16]];
const nacelle: Outline = [[0.31, -0.19], [0.22, -0.38], [-0.37, -0.48], [-0.51, -0.36], [-0.51, -0.22], [-0.28, -0.19]];
const prow: Outline = [[0.55, -0.1], [0.42, -0.26], [0.1, -0.28], [0.02, -0.15], [0.38, -0.09]];
const frigateWing: Outline = [[0.43, -0.08], [0.05, -0.48], [-0.46, -0.5], [-0.24, -0.23], [-0.42, -0.12]];
const mirror = function (outline: Outline): Outline { return outline.map(function ([f, a]) { return [f, -a] as const; }); };

export const drawStarship = function (ctx: CanvasRenderingContext2D, camera: Camera, ship: Ship, state: State) {
	const player = ship.id === 0; const heavy = player || ship.length > 150; const alive = ship.hp > 0;
	const accent = !alive ? '#435064' : player ? '#8bf4ed' : heavy ? '#ffb26a' : '#ff7d8f';
	const dark = player ? '#182b40' : '#352333';
	const screen = function (f: number, a: number, z = 0) { return worldToScreen(localPoint(ship, f * ship.length, a * ship.width), camera, z); };
	const points = function (outline: Outline, z: number) { return outline.map(function ([f, a]) { return screen(f, a, z); }); };
	const module = function (outline: Outline, bottom: number, top: number, pale = false) {
		const low = points(outline, bottom); const high = points(outline, top);
		for (let i = 0; i < high.length; i++) {
			const next = (i + 1) % high.length; const a = high[i]; const b = high[next]; const c = low[next]; const d = low[i];
			if (a && b && c && d) polygon(ctx, [a, b, c, d], i % 3 === 0 ? '#304258' : dark, '#0a1424');
		}
		const start = high[0]; const end = high[Math.floor(high.length / 2)];
		if (!start || !end) return;
		const metal = ctx.createLinearGradient(start.x, start.y, end.x + 1, end.y + 1);
		metal.addColorStop(0, pale ? '#b4c8d9' : player ? '#748ba3' : '#a77f8b');
		metal.addColorStop(0.45, pale ? '#748da7' : player ? '#405875' : '#654b65');
		metal.addColorStop(1, player ? '#253c57' : '#322a43');
		polygon(ctx, high, metal, player ? '#a0bed077' : '#d18e9677');
	};
	const speed = Math.hypot(ship.vx, ship.vy); const power = player ? Math.abs(state.player.throttle) : 0.55;
	const flame = 0.08 + power * 0.35 + speed * 0.0015 + Math.sin(state.time * 24 + ship.id) * 0.015;
	ctx.save();
	// Engine light stays attached to the hull; trails follow actual velocity through a turn.
	for (const offset of alive ? heavy ? [-0.32, 0.32] : [-0.27, 0.27] : []) {
		const nozzle = screen(-0.49, offset, 14);
		const trail = worldToScreen({ x: ship.x - Math.cos(ship.angle) * ship.length * (0.5 + flame) - ship.vx * 0.3,
			y: ship.y - Math.sin(ship.angle) * ship.length * (0.5 + flame) - ship.vy * 0.3 }, camera, 14);
		const start = screen(-0.5, offset - 0.06, 14); const end = screen(-0.5, offset + 0.06, 14);
		// Keep each exhaust cone centered on its own nacelle.
		const center = screen(-0.49, 0, 14); const tip = { x: trail.x + nozzle.x - center.x, y: trail.y + nozzle.y - center.y };
		const glow = ctx.createRadialGradient(nozzle.x, nozzle.y, 0, nozzle.x, nozzle.y, 45 * camera.scale);
		glow.addColorStop(0, player ? '#35cfe45c' : '#ef65794c'); glow.addColorStop(1, '#00000000');
		ctx.fillStyle = glow; ctx.fillRect(nozzle.x - 45 * camera.scale, nozzle.y - 45 * camera.scale, 90 * camera.scale, 90 * camera.scale);
		polygon(ctx, [start, tip, end], player ? '#4dcce54a' : '#fc72874a');
		line(ctx, nozzle, { x: nozzle.x + (tip.x - nozzle.x) * 0.65, y: nozzle.y + (tip.y - nozzle.y) * 0.65 }, accent, Math.max(1, 3 * camera.scale));
	}
	module(spine, 2, heavy ? 21 : 15);
	for (const sign of [-1, 1]) {
		const shape = heavy ? nacelle : frigateWing;
		module(sign === -1 ? shape : mirror(shape), 4, heavy ? 24 : 17);
		if (heavy) module(sign === -1 ? prow : mirror(prow), 18, 30, true);
		// Armored battery rails are enclosed in the nacelles.
		for (let i = 0; i < (player ? 6 : 4); i++) {
			const f = player ? (64 - i * 25) / ship.length : 0.2 - i * 0.15;
			const ready = alive && (!player || state.batteries[sign < 0 ? 'port' : 'starboard'].reload === 0);
			line(ctx, screen(f, sign * 0.29, 25), screen(f - 0.035, sign * 0.44, 25), '#091322', Math.max(2, 7 * camera.scale));
			line(ctx, screen(f, sign * 0.34, 26), screen(f - 0.022, sign * 0.44, 26), ready ? accent : '#435064', Math.max(1, 2 * camera.scale));
		}
		for (let i = 0; i < 5; i++) {
			const f = -0.3 + i * 0.045;
			line(ctx, screen(f, sign * 0.22, 25), screen(f - 0.02, sign * 0.31, 25), '#111f33', 2 * camera.scale);
		}
		line(ctx, screen(-0.46, sign * 0.23, 25), screen(-0.46, sign * 0.39, 25), accent, 2 * camera.scale);
		line(ctx, screen(0.25, sign * 0.2, 31), screen(0.38, sign * 0.15, 31), '#dce7ed99', camera.scale);
	}
	const reactor: Outline = [[0.16, -0.07], [0.19, 0], [0.16, 0.07], [-0.31, 0.08], [-0.37, 0], [-0.31, -0.08]];
	module(reactor, 21, heavy ? 34 : 24, true);
	line(ctx, screen(-0.27, 0, heavy ? 35 : 25), screen(0.13, 0, heavy ? 35 : 25), accent, Math.max(1, 3 * camera.scale));
	for (const f of [-0.12, -0.02, 0.08, 0.32]) {
		line(ctx, screen(f, -0.11, 22), screen(f, 0.11, 22), '#0c1b2f', camera.scale);
	}
	// Identification stripes and drive-control jets replace nautical superstructure.
	for (const f of [-0.1, -0.06, -0.02]) line(ctx, screen(f, -0.14, 23), screen(f + 0.03, -0.2, 25), player ? '#f0c582' : '#ec8b91', 2 * camera.scale);
	if (player && Math.abs(state.player.yaw) > 0.025) {
		const sign = Math.sign(state.player.yaw);
		line(ctx, screen(0.37, -sign * 0.19, 23), screen(0.37, -sign * 0.43, 23), '#a0edff99', 3 * camera.scale);
		line(ctx, screen(-0.4, sign * 0.4, 14), screen(-0.4, sign * 0.65, 14), '#a0edff99', 3 * camera.scale);
	}
	if (player && state.shield.active > 0) {
		const at = worldToScreen(ship, camera, 18); const r = ship.length * camera.scale * 0.68;
		const shield = ctx.createRadialGradient(at.x, at.y, r * 0.25, at.x, at.y, r);
		shield.addColorStop(0, '#6eefff00'); shield.addColorStop(0.85, '#6eefff12'); shield.addColorStop(1, '#8cfaff44');
		ctx.beginPath(); ctx.ellipse(at.x, at.y, r, r * 0.63, -0.18, 0, Math.PI * 2); ctx.fillStyle = shield; ctx.fill(); ctx.strokeStyle = '#9af6ff99'; ctx.stroke();
	}
	ctx.restore();
};
