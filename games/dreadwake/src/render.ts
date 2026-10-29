import { ARC, RANGE, clamp, distance, inArc, localPoint, sideAngle, targetFor, type Point, type Ship, type Side, type State } from './simulation';
import { cameraFor, worldToScreen, type Camera } from './projection';

const polygon = function (ctx: CanvasRenderingContext2D, points: readonly Point[], fill: string, stroke?: string) {
	const first = points[0]; if (!first) return;
	ctx.beginPath(); ctx.moveTo(first.x, first.y);
	for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
	ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
	if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
};
const line = function (ctx: CanvasRenderingContext2D, a: Point, b: Point, color: string, width = 1) {
	ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
};
const ring = function (ctx: CanvasRenderingContext2D, at: Point, radius: number, color: string) {
	ctx.beginPath(); ctx.ellipse(at.x, at.y, radius, radius * 0.58, 0, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
};
const label = function (ctx: CanvasRenderingContext2D, value: string, at: Point, color: string, size = 10) {
	ctx.font = `500 ${size}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(value, at.x, at.y);
};
const hullPoints = function (ship: Ship, size = 1) {
	return [[0.52, 0], [0.29, -0.5], [-0.42, -0.5], [-0.5, -0.25], [-0.5, 0.25], [-0.42, 0.5], [0.29, 0.5]]
		.map(function (pair) { return localPoint(ship, (pair[0] ?? 0) * ship.length * size, (pair[1] ?? 0) * ship.width * size); });
};
const drawShip = function (ctx: CanvasRenderingContext2D, camera: Camera, ship: Ship, player: boolean, state: State) {
	const screen = function (at: Point, height = 0) { return worldToScreen(at, camera, height); };
	const color = player ? '#a7c0c5' : '#b2756e';
	const highlight = player ? '#d1e1dc' : '#e1a095';
	const speed = Math.hypot(ship.vx, ship.vy);
	const flame = 20 + speed * 0.65 + Math.sin(state.time * 23 + ship.id) * 5;
	if (speed > 1) {
		const aft = -ship.length * 0.48;
		for (const offset of [-0.19, 0.19]) {
			polygon(ctx, [localPoint(ship, aft, ship.width * (offset - 0.1)), localPoint(ship, aft - flame, ship.width * offset), localPoint(ship, aft, ship.width * (offset + 0.1))]
				.map(function (at) { return screen(at, 14); }), player ? '#79ddd36b' : '#ff93626b');
		}
	}
	const points = hullPoints(ship); const low = points.map(function (at) { return screen(at, 3); });
	const top = points.map(function (at) { return screen(at, 23); });
	polygon(ctx, points.map(function (at) { return screen(at, -10); }), '#00000050');
	for (let i = 0; i < points.length; i++) {
		const next = (i + 1) % points.length;
		const a = top[i]; const b = top[next]; const c = low[next]; const d = low[i];
		if (a && b && c && d) polygon(ctx, [a, b, c, d], player ? '#334b58' : '#4e353e', '#152530');
	}
	polygon(ctx, top, color, player ? '#c4dfda' : '#df9c8a');
	polygon(ctx, hullPoints(ship, 0.82).map(function (at) { return screen(at, 24); }), player ? '#566c73' : '#794f55');
	// Deck spine and a raised bridge give the placeholder a readable capital-ship silhouette.
	const bridge = { ...ship, x: localPoint(ship, -ship.length * 0.16, 0).x, y: localPoint(ship, -ship.length * 0.16, 0).y, length: ship.length * 0.31, width: ship.width * 0.42 };
	const roof = hullPoints(bridge).map(function (at) { return screen(at, 43); });
	const base = hullPoints(bridge).map(function (at) { return screen(at, 24); });
	for (let i = 0; i < roof.length; i++) {
		const a = roof[i]; const b = roof[(i + 1) % roof.length]; const c = base[(i + 1) % base.length]; const d = base[i];
		if (a && b && c && d) polygon(ctx, [a, b, c, d], player ? '#263f4c' : '#50343c');
	}
	polygon(ctx, roof, highlight, '#1c3441');
	line(ctx, screen(localPoint(ship, 18, 0), 25), screen(localPoint(ship, ship.length * 0.39, 0), 25), highlight, 2);
	line(ctx, screen(localPoint(bridge, -6, -bridge.width * 0.45), 39), screen(localPoint(bridge, 9, -bridge.width * 0.45), 39), player ? '#75f3e0' : '#ffb39a', 2);
	for (const side of ['port', 'starboard'] as const) {
		const sign = side === 'port' ? -1 : 1;
		const count = player ? 6 : 4;
		for (let i = 0; i < count; i++) {
			const forward = player ? 64 - i * 25 : ship.length * (0.27 - i * 0.17);
			const a = screen(localPoint(ship, forward, sign * ship.width * 0.41), 27);
			const b = screen(localPoint(ship, forward, sign * (ship.width * 0.58 + 5)), 27);
			line(ctx, a, b, '#142734', Math.max(2, camera.scale * 6));
			line(ctx, a, b, player ? '#eacb91' : '#d5a08e', Math.max(1, camera.scale * 2));
		}
	}
	const at = screen(ship, 60);
	if (player) {
		label(ctx, state.player.braced ? '▰ BRACED / 65% DAMAGE REDUCTION' : 'CSV DREADWAKE', { x: at.x, y: at.y - 12 }, state.player.braced ? '#f3cd8d' : '#bbd9d6', 9);
		if (state.player.braced) ring(ctx, screen(ship), ship.length * camera.scale * 0.65, '#edc68690');
	} else {
		const locked = inArc(state.player, ship, 'port') || inArc(state.player, ship, 'starboard');
		label(ctx, `${ship.length > 150 ? 'CRUISER' : 'FRIGATE'} ${String(ship.id).padStart(2, '0')}`, { x: at.x, y: at.y - 10 }, locked ? '#efcb8b' : '#ce9690', 9);
		line(ctx, { x: at.x - 22, y: at.y - 3 }, { x: at.x + 22, y: at.y - 3 }, '#2c333c', 3);
		line(ctx, { x: at.x - 22, y: at.y - 3 }, { x: at.x - 22 + 44 * ship.hp / ship.maxHp, y: at.y - 3 }, '#d48d7f', 3);
	}
};
const drawArc = function (ctx: CanvasRenderingContext2D, camera: Camera, state: State, side: Side) {
	const p = state.player; const angle = sideAngle(p, side); const target = targetFor(state, side);
	const ready = state.batteries[side].reload === 0 && !p.braced;
	const origin = worldToScreen(p, camera);
	const points = Array.from({ length: 25 }, function (_, i) {
		const direction = angle - ARC + ARC * 2 * i / 24;
		return worldToScreen({ x: p.x + Math.cos(direction) * RANGE, y: p.y + Math.sin(direction) * RANGE }, camera);
	});
	polygon(ctx, [origin, ...points], target && ready ? '#d6b8790c' : '#7db8bf05');
	ctx.setLineDash([3, 8]);
	const first = points[0]; const last = points[points.length - 1];
	if (first && last) { line(ctx, origin, first, ready ? '#96c4bf38' : '#96c4bf18'); line(ctx, origin, last, ready ? '#96c4bf38' : '#96c4bf18'); }
	ctx.beginPath(); for (const [i, point] of points.entries()) { if (i === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); }
	ctx.strokeStyle = target && ready ? '#eacb8960' : '#96c4bf25'; ctx.stroke(); ctx.setLineDash([]);
	if (target) {
		const at = worldToScreen(target, camera); const r = target.length * camera.scale * 0.7;
		ring(ctx, at, r, ready ? '#eacb8980' : '#85a9ae50');
	}
	const tag = worldToScreen({ x: p.x + Math.cos(angle) * 230, y: p.y + Math.sin(angle) * 230 }, camera);
	label(ctx, `${side === 'port' ? 'Q / PORT' : 'E / STBD'}`, tag, ready ? '#9dbfbaaa' : '#61778188', 9);
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
export const render = function (ctx: CanvasRenderingContext2D, width: number, height: number, state: State, reducedMotion: boolean) {
	ctx.fillStyle = '#091420'; ctx.fillRect(0, 0, width, height);
	const camera = cameraFor(width, height, state.player);
	// Deterministic, camera-relative stars and a faint isometric reference plane expose drift.
	for (let i = 0; i < 180; i++) {
		const x = ((Math.sin(i * 127.1) * 43758.5453 - camera.center.x * 0.08) % width + width) % width;
		const y = ((Math.cos(i * 311.7) * 32719.281 - camera.center.y * 0.08) % height + height) % height;
		ctx.fillStyle = i % 7 === 0 ? '#a8c5cf70' : '#68889940'; ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, 1);
	}
	ctx.save();
	if (!reducedMotion) ctx.translate(Math.sin(state.time * 83) * state.shake, Math.cos(state.time * 71) * state.shake * 0.6);
	const p = state.player; const grid = 200;
	for (let i = -7; i <= 7; i++) {
		const x = Math.floor(p.x / grid) * grid + i * grid; const y = Math.floor(p.y / grid) * grid + i * grid;
		line(ctx, worldToScreen({ x, y: p.y - 1600 }, camera), worldToScreen({ x, y: p.y + 1600 }, camera), '#49728610');
		line(ctx, worldToScreen({ x: p.x - 1600, y }, camera), worldToScreen({ x: p.x + 1600, y }, camera), '#49728610');
	}
	for (let i = 0; i < 20; i++) {
		const at = worldToScreen({ x: Math.sin(i * 7.2) * 2600, y: Math.cos(i * 3.1) * 2600 }, camera, -80 - i % 3 * 10);
		const r = (8 + i % 4 * 8) * camera.scale;
		polygon(ctx, [{ x: at.x - r, y: at.y }, { x: at.x, y: at.y - r * 0.4 }, { x: at.x + r * 0.7, y: at.y + r * 0.3 }, { x: at.x, y: at.y + r * 0.6 }], '#172938', '#29404c');
	}
	drawArc(ctx, camera, state, 'port'); drawArc(ctx, camera, state, 'starboard');
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
		polygon(ctx, hullPoints(ship).map(function (point) { return worldToScreen(point, camera, -30); }), '#453d42', '#6c5551'); ctx.globalAlpha = 1;
	}
	const ships: Ship[] = [...state.enemies, p];
	ships.sort(function (a, b) { return a.x + a.y - b.x - b.y; });
	for (const ship of ships) drawShip(ctx, camera, ship, ship.id === 0, state);
	for (const shell of state.shells) {
		const at = worldToScreen(shell, camera, 22);
		const tail = worldToScreen({ x: shell.x - shell.vx * 0.085, y: shell.y - shell.vy * 0.085 }, camera, 22);
		line(ctx, tail, at, shell.hostile ? '#f5916f75' : '#f4d99c65', shell.hostile ? 2 : 3);
		ctx.fillStyle = shell.hostile ? '#ffb391' : '#fff1c9'; ctx.beginPath(); ctx.arc(at.x, at.y, shell.hostile ? 2 : 2.8, 0, Math.PI * 2); ctx.fill();
	}
	for (const fx of state.effects) {
		const progress = 1 - fx.life / fx.duration; const at = worldToScreen(fx, camera, 23);
		const r = (fx.kind === 'explosion' ? 100 : fx.kind === 'impact' ? 28 : 21) * camera.scale;
		ctx.globalAlpha = 1 - progress;
		ctx.beginPath(); ctx.arc(at.x, at.y, r * (0.15 + progress), 0, Math.PI * 2); ctx.fillStyle = fx.kind === 'muzzle' ? '#ffe0a8' : '#e89d6950'; ctx.fill();
		ctx.strokeStyle = '#ffca8a'; ctx.stroke();
		for (let i = 0; i < 7; i++) {
			const theta = i * 2.4; const spread = r * progress * 1.8;
			line(ctx, { x: at.x + Math.cos(theta) * spread * 0.5, y: at.y + Math.sin(theta) * spread * 0.5 },
				{ x: at.x + Math.cos(theta) * spread, y: at.y + Math.sin(theta) * spread }, '#f2c58c', 2);
		}
		ctx.globalAlpha = 1;
	}
	ctx.restore();
	for (const enemy of state.enemies) {
		const at = worldToScreen(enemy, camera);
		const safeTop = height < 500 ? 70 : 100;
		const safeBottom = height - (width < 700 ? 225 : height < 500 ? 110 : 185);
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
