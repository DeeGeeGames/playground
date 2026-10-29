import { ARENA, type Point, type State } from './simulation';
const beamStyles: readonly (readonly [number, string])[] = [[9, '#6ce6ce55'], [3, '#b8fff0']];
export interface Camera extends Point { scale: number }
export const cameraFor = function (width: number, height: number, state: State): Camera {
	const scale = Math.max(0.4, Math.min(width / 1100, height / 760));
	return { x: state.player.x - width / scale / 2, y: state.player.y - height / scale / 2, scale };
};
export const render = function (ctx: CanvasRenderingContext2D, width: number, height: number, state: State, aim: Point) {
	const camera = cameraFor(width, height, state);
	ctx.fillStyle = '#141d19'; ctx.fillRect(0, 0, width, height);
	ctx.save();
	ctx.scale(camera.scale, camera.scale);
	ctx.translate(-camera.x + Math.sin(state.time * 91) * state.shake, -camera.y + Math.cos(state.time * 79) * state.shake);
	ctx.fillStyle = '#202b23'; ctx.fillRect(0, 0, ARENA.width, ARENA.height);
	ctx.strokeStyle = '#2d382e'; ctx.lineWidth = 1;
	for (let x = 0; x <= ARENA.width; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ARENA.height); ctx.stroke(); }
	for (let y = 0; y <= ARENA.height; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ARENA.width, y); ctx.stroke(); }
	ctx.strokeStyle = '#7d7653'; ctx.lineWidth = 5; ctx.strokeRect(0, 0, ARENA.width, ARENA.height);
	// Deterministic terrain marks are decoration, never hidden collision geometry.
	for (let i = 0; i < 42; i++) {
		const x = (i * 367 + 71) % ARENA.width; const y = (i * 193 + 40) % ARENA.height;
		ctx.fillStyle = '#18221c'; ctx.beginPath(); ctx.ellipse(x, y, 20 + i % 20, 10 + i % 12, i, 0, Math.PI * 2); ctx.fill();
	}
	ctx.save(); ctx.translate(ARENA.relayX, ARENA.relayY);
	ctx.strokeStyle = '#809c79'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 65, 0, Math.PI * 2); ctx.stroke();
	ctx.fillStyle = '#394d3c'; ctx.fillRect(-30, -30, 60, 60); ctx.strokeRect(-30, -30, 60, 60);
	ctx.fillStyle = '#c7dca1'; ctx.fillRect(-5, -46, 10, 66);
	ctx.font = '12px monospace'; ctx.textAlign = 'center'; ctx.fillText('RELAY / ' + Math.max(0, state.relay) + '%', 0, 90); ctx.restore();
	const mech = function (at: Point, hull: number, turret: number, player: boolean, hp: number, moving: boolean) {
		ctx.save(); ctx.translate(at.x, at.y);
		ctx.fillStyle = '#0005'; ctx.beginPath(); ctx.ellipse(5, 10, 34, 29, 0, 0, Math.PI * 2); ctx.fill();
		ctx.save(); ctx.rotate(hull);
		const stride = moving ? Math.sin(state.time * 7) * 6 : 0;
		ctx.fillStyle = '#111a16'; ctx.fillRect(-22 + stride, -29, 40, 15); ctx.fillRect(-22 - stride, 14, 40, 15);
		ctx.strokeStyle = player ? '#9fae83' : '#bb7d65'; ctx.lineWidth = 2;
		ctx.strokeRect(-22 + stride, -29, 40, 15); ctx.strokeRect(-22 - stride, 14, 40, 15);
		ctx.fillStyle = player ? '#596e50' : '#744d3e'; ctx.fillRect(-20, -18, 42, 36); ctx.restore();
		ctx.save(); ctx.rotate(turret);
		ctx.fillStyle = '#101812'; ctx.fillRect(5, -14, 36, 9); ctx.fillRect(5, 5, 30, 8);
		ctx.fillStyle = player ? '#a9b68b' : '#be8a70'; ctx.fillRect(-17, -16, 33, 32);
		ctx.fillStyle = '#283e33'; ctx.fillRect(-7, -10, 15, 20);
		ctx.fillStyle = player ? '#b1eee2' : '#ffb172'; ctx.fillRect(7, -7, 5, 14); ctx.restore();
		ctx.fillStyle = '#0c130f'; ctx.fillRect(-26, -42, 52, 4);
		ctx.fillStyle = player ? '#c2d38a' : '#de9673'; ctx.fillRect(-26, -42, 52 * Math.max(0, hp) / 100, 4);
		ctx.restore();
	};
	for (const enemy of state.enemies) mech(enemy, enemy.angle, enemy.angle, false, enemy.hp, true);
	mech(state.player, state.player.angle, state.player.turret, true, state.player.hp, Math.abs(state.player.speed) > 8);
	if (state.beam) {
		for (const [thickness, color] of beamStyles) {
			ctx.lineWidth = thickness; ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(state.player.x, state.player.y); ctx.lineTo(state.beam.x, state.beam.y); ctx.stroke();
		}
	}
	for (const shot of state.shots) {
		ctx.strokeStyle = shot.kind === 'enemy' ? '#ed9a6f' : shot.kind === 'missile' ? '#ffca82' : '#fff2b5';
		ctx.lineWidth = shot.kind === 'cannon' ? 5 : 3;
		ctx.beginPath(); ctx.moveTo(shot.x - shot.vx * 0.045, shot.y - shot.vy * 0.045); ctx.lineTo(shot.x, shot.y); ctx.stroke();
	}
	for (const effect of state.effects) {
		ctx.globalAlpha = effect.life * 2; ctx.strokeStyle = effect.color; ctx.lineWidth = 3;
		ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.size * (1 - effect.life) + 2, 0, Math.PI * 2); ctx.stroke();
	}
	ctx.globalAlpha = 1;
	ctx.strokeStyle = '#d9e3b0'; ctx.lineWidth = 1;
	ctx.beginPath(); ctx.arc(aim.x, aim.y, 14, 0, Math.PI * 2); ctx.moveTo(aim.x - 22, aim.y); ctx.lineTo(aim.x - 9, aim.y); ctx.moveTo(aim.x + 9, aim.y); ctx.lineTo(aim.x + 22, aim.y); ctx.moveTo(aim.x, aim.y - 22); ctx.lineTo(aim.x, aim.y - 9); ctx.stroke();
	ctx.restore();
};
