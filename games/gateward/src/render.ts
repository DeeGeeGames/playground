import { ESCORTS, ROUTE_SECONDS, WEAPONS, type Point, type State } from './simulation';

export interface View { width: number; height: number; scale: number; cx: number; cy: number }
export const viewFor = function (width: number, height: number): View { return { width, height, scale: width < 650 ? Math.min(width / 900, height / 850) : Math.min(width / 1180, height / 970), cx: width / 2, cy: height / 2 }; };
export const toWorld = function (point: Point, view: View): Point { return { x: (point.x - view.cx) / view.scale, y: (point.y - view.cy) / view.scale }; };
const polygon = function (ctx: CanvasRenderingContext2D, points: readonly (readonly number[])[]) {
	ctx.beginPath(); for (const [i, point] of points.entries()) { const x = point[0] ?? 0; const y = point[1] ?? 0; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath();
};
const circle = function (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); };
const bar = function (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, ratio: number, color: string) {
	ctx.fillStyle = '#101e2c'; ctx.fillRect(x - width / 2, y, width, 4); ctx.fillStyle = color; ctx.fillRect(x - width / 2, y, width * Math.max(0, ratio), 4);
};
export const render = function (ctx: CanvasRenderingContext2D, view: View, state: State, selected: number, reducedMotion: boolean, rallyMode: boolean) {
	const { width, height, cx, cy, scale } = view;
	ctx.fillStyle = '#080f19'; ctx.fillRect(0, 0, width, height);
	// Deterministic stars drift past the camera to communicate the slow rail journey.
	for (let i = 0; i < 145; i++) {
		const drift = reducedMotion ? 0 : state.time * (i % 3 + 1) * 0.65;
		const x = ((i * 173.73 - drift) % width + width) % width; const y = (i * 97.31) % height;
		ctx.fillStyle = i % 5 === 0 ? '#6e8b9d' : '#293d50'; ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, 1);
	}
	ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale);
	ctx.lineWidth = 1 / scale; ctx.strokeStyle = '#142433'; ctx.setLineDash([4, 12]);
	ctx.beginPath(); ctx.moveTo(-1500, 0); ctx.lineTo(1500, 0); ctx.stroke(); ctx.setLineDash([]);
	for (const y of [-360, 360]) { ctx.beginPath(); ctx.moveTo(-400, y); ctx.lineTo(400, y); ctx.stroke(); }
	ctx.font = '12px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#526b7d'; ctx.fillText('PORT', 0, -385); ctx.fillText('STARBOARD', 0, 390); ctx.fillText('BOW →', 390, -16); ctx.fillText('← ASTERN', -400, -16);
	if (state.time > ROUTE_SECONDS - 35) {
		const gateX = 600 - Math.min(1, (state.time - (ROUTE_SECONDS - 35)) / 35) * 220;
		ctx.save(); ctx.translate(gateX, 0); ctx.scale(0.35, 1); ctx.strokeStyle = '#83dfcb'; ctx.lineWidth = 12; circle(ctx, 0, 0, 150); ctx.stroke(); ctx.strokeStyle = '#25544e'; ctx.lineWidth = 25; circle(ctx, 0, 0, 170); ctx.stroke(); ctx.restore();
		ctx.fillStyle = '#83dfcb'; ctx.fillText('KEPLER GATE', gateX, -195);
	}
	const mount = state.mounts[selected];
	if (mount?.weapon) {
		circle(ctx, mount.x, mount.y, WEAPONS[mount.weapon].range * (1 + (mount.level - 1) * 0.12)); ctx.fillStyle = '#84ead907'; ctx.fill(); ctx.strokeStyle = '#84ead930'; ctx.setLineDash([6, 8]); ctx.stroke(); ctx.setLineDash([]);
	}
	if (state.escorts.length > 0 || rallyMode) {
		ctx.strokeStyle = rallyMode ? '#d5ed9b' : '#9edbf077'; ctx.lineWidth = 1.5 / scale;
		circle(ctx, state.rally.x, state.rally.y, 25); ctx.stroke(); ctx.beginPath(); ctx.moveTo(state.rally.x - 35, state.rally.y); ctx.lineTo(state.rally.x + 35, state.rally.y); ctx.moveTo(state.rally.x, state.rally.y - 35); ctx.lineTo(state.rally.x, state.rally.y + 35); ctx.stroke();
		ctx.fillStyle = '#89bed2'; ctx.fillText('RALLY', state.rally.x, state.rally.y + 45);
	}
	// The capital ship: a broad armored hull, aft drives, bridge, and eight hardpoints.
	for (const y of [-22, 22]) {
		ctx.fillStyle = '#7de5db'; polygon(ctx, [[-143, y - 10], [-143, y + 10], [-180 - (reducedMotion ? 0 : Math.sin(state.time * 17) * 7), y]]); ctx.fill();
	}
	polygon(ctx, [[-145, -32], [-125, -58], [85, -58], [155, -20], [168, 0], [155, 20], [85, 58], [-125, 58], [-145, 32]]);
	ctx.fillStyle = '#314958'; ctx.fill(); ctx.strokeStyle = '#7897a8'; ctx.lineWidth = 2; ctx.stroke();
	polygon(ctx, [[-115, -26], [79, -26], [135, 0], [79, 26], [-115, 26]]); ctx.fillStyle = '#1a2d3d'; ctx.fill(); ctx.strokeStyle = '#486779'; ctx.stroke();
	ctx.fillStyle = '#506d7d'; ctx.fillRect(-70, -20, 44, 40); ctx.fillStyle = '#86dcd7'; ctx.fillRect(-65, -16, 5, 32);
	ctx.fillStyle = '#738e9f'; ctx.font = '12px monospace'; ctx.fillText('ARK / 07', 35, 4);
	if (state.shield > 0) { ctx.strokeStyle = '#88f1e4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, 185, 95, 0, 0, Math.PI * 2); ctx.stroke(); }
	for (const [i, m] of state.mounts.entries()) {
		ctx.save(); ctx.translate(m.x, m.y);
		circle(ctx, 0, 0, 18); ctx.fillStyle = selected === i ? '#d6efad' : m.weapon ? '#648d98' : '#132331'; ctx.fill(); ctx.strokeStyle = selected === i ? '#e7f9ce' : '#7298a5'; ctx.lineWidth = selected === i ? 3 : 1; ctx.stroke();
		if (m.weapon) {
			ctx.save(); ctx.rotate(m.aim); ctx.fillStyle = m.weapon === 'rail' ? '#cdb6ef' : m.weapon === 'missile' ? '#edc589' : '#91e3da';
			ctx.fillRect(0, -4, m.weapon === 'rail' ? 30 : 23, 8); if (m.weapon === 'missile') ctx.fillRect(0, -10, 18, 5); ctx.restore();
			for (let pip = 0; pip < m.level; pip++) { ctx.fillStyle = '#def3cf'; ctx.fillRect(-8 + pip * 7, 21, 4, 4); }
		} else { ctx.fillStyle = '#7894a4'; ctx.font = '18px monospace'; ctx.fillText('+', 0, 6); }
		ctx.fillStyle = selected === i ? '#d6efad' : '#8ea9ba'; ctx.font = '13px monospace'; ctx.fillText(String(i + 1), 0, m.y < 0 ? -28 : 43); ctx.restore();
	}
	for (const enemy of state.enemies) {
		ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.rotate(Math.atan2(-enemy.y, -enemy.x));
		ctx.fillStyle = enemy.kind === 'armored' ? '#ab7d9f' : enemy.kind === 'bomber' ? '#da9b69' : '#d96f73'; ctx.strokeStyle = '#f5b6a3'; ctx.lineWidth = 1.5;
		if (enemy.kind === 'flagship') polygon(ctx, [[-46,-22], [-18,-35], [45,-15], [58,0], [45,15], [-18,35], [-46,22], [-22,0]]);
		else if (enemy.kind === 'armored') polygon(ctx, [[-22,-20], [17,-20], [30,0], [17,20], [-22,20]]);
		else if (enemy.kind === 'bomber') polygon(ctx, [[-18,-20], [0,-12], [22,0], [0,12], [-18,20], [-9,0]]);
		else polygon(ctx, [[-13,-11], [18,0], [-13,11], [-5,0]]);
		ctx.fill(); ctx.stroke(); ctx.restore();
		if (enemy.hp < enemy.maxHp || enemy.kind === 'flagship') bar(ctx, enemy.x, enemy.y - (enemy.kind === 'flagship' ? 48 : 30), enemy.kind === 'flagship' ? 90 : 34, enemy.hp / enemy.maxHp, '#e78b82');
		if (enemy.id === state.priority) { circle(ctx, enemy.x, enemy.y, enemy.kind === 'flagship' ? 63 : 38); ctx.strokeStyle = '#f4d68a'; ctx.setLineDash([7,5]); ctx.stroke(); ctx.setLineDash([]); }
		const limitX = width / scale / 2 - 24; const limitY = height / scale / 2 - 24;
		if (Math.abs(enemy.x) > limitX || Math.abs(enemy.y) > limitY) {
			const factor = Math.min(limitX / Math.max(1, Math.abs(enemy.x)), limitY / Math.max(1, Math.abs(enemy.y)));
			ctx.save(); ctx.translate(enemy.x * factor, enemy.y * factor); ctx.rotate(Math.atan2(enemy.y, enemy.x)); polygon(ctx, [[9,0],[-6,-6],[-6,6]]); ctx.fillStyle = '#f59682'; ctx.fill(); ctx.restore();
		}
	}
	for (const escort of state.escorts) {
		ctx.save(); ctx.translate(escort.x, escort.y); ctx.rotate(escort.angle); ctx.fillStyle = escort.kind === 'guardian' ? '#8fbbeb' : '#96e6e1';
		if (escort.kind === 'guardian') polygon(ctx, [[-20,-13],[10,-13],[23,0],[10,13],[-20,13],[-13,0]]); else polygon(ctx, [[-11,-8],[15,0],[-11,8],[-5,0]]);
		ctx.fill(); ctx.restore(); if (escort.hp < ESCORTS[escort.kind].hp) bar(ctx, escort.x, escort.y - 22, 30, escort.hp / ESCORTS[escort.kind].hp, '#89d5de');
	}
	for (const shot of state.shots) {
		ctx.strokeStyle = shot.side === 'enemy' ? '#ff8d7f' : shot.weapon === 'rail' ? '#dbbeff' : shot.weapon === 'missile' ? '#f5ce8a' : '#99ece1';
		ctx.lineWidth = shot.weapon === 'rail' ? 3 : 2; ctx.beginPath(); ctx.moveTo(shot.x, shot.y); ctx.lineTo(shot.x - shot.vx * (shot.weapon === 'rail' ? 0.04 : 0.025), shot.y - shot.vy * 0.025); ctx.stroke();
	}
	for (const e of state.effects) { ctx.globalAlpha = e.life / e.maxLife; ctx.strokeStyle = e.color; ctx.lineWidth = 3; circle(ctx, e.x, e.y, e.radius * (1 - e.life / e.maxLife * 0.7)); ctx.stroke(); }
	ctx.globalAlpha = 1; ctx.restore();
};
