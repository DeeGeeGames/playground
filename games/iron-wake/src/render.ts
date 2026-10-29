import { ARENA, distance, type EnemyKind, type Point, type State } from './simulation';
import { cameraFor, project, worldToScreen } from './projection';
import { createGait, legJoints, mechScale, type Gaits, type WalkerGait } from './gait';

export interface RenderOptions { reducedMotion: boolean; showRadar: boolean; gaits: Gaits }
interface Palette { top: string; side: string; edge: string }
const steel = { top: '#546879', side: '#293948', edge: '#7d91a0' };
const dark = { top: '#263744', side: '#16232e', edge: '#415464' };
const amber = { top: '#c79555', side: '#775534', edge: '#e7bf7c' };
const enemies: Record<EnemyKind, Palette> = {
	scout: { top: '#b07961', side: '#623e38', edge: '#cf9c80' },
	striker: { top: '#997059', side: '#59423a', edge: '#d4a476' },
	siege: { top: '#886065', side: '#4b3442', edge: '#c68d8d' },
};
const TAU = Math.PI * 2;
export const render = function (ctx: CanvasRenderingContext2D, width: number, height: number, state: State, aim: Point, options: RenderOptions) {
	const camera = cameraFor(width, height, state);
	const sky = ctx.createLinearGradient(0, 0, 0, height);
	sky.addColorStop(0, '#1a2935'); sky.addColorStop(1, '#0a141e');
	ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
	ctx.save();
	const shake = options.reducedMotion ? 0 : state.shake;
	ctx.translate(width / 2 - camera.x * camera.scale + Math.sin(state.time * 79) * shake, height * 0.52 - camera.y * camera.scale + Math.cos(state.time * 91) * shake);
	ctx.scale(camera.scale, camera.scale);
	const path = function (points: readonly Point[], fill: string, stroke?: string) {
		const first = points[0]; if (!first) return;
		ctx.beginPath(); ctx.moveTo(first.x, first.y);
		for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
		ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
		if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.8; ctx.stroke(); }
	};
	const line = function (a: Point, b: Point, color: string, thickness = 1, z = 0) {
		const start = project(a, z); const end = project(b, z);
		ctx.strokeStyle = color; ctx.lineWidth = thickness; ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
	};
	const disc = function (point: Point, radius: number, color: string, outline = false, z = 0) {
		const at = project(point, z); ctx.beginPath(); ctx.ellipse(at.x, at.y, radius * 1.22, radius * 0.7, 0, 0, TAU);
		if (outline) { ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke(); } else { ctx.fillStyle = color; ctx.fill(); }
	};
	const local = function (at: Point, forward: number, side: number, angle: number): Point {
		return { x: at.x + Math.cos(angle) * forward - Math.sin(angle) * side, y: at.y + Math.sin(angle) * forward + Math.cos(angle) * side };
	};
	const box = function (at: Point, length: number, breadth: number, z: number, tall: number, palette: Palette, angle = 0) {
		const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (pair) { return local(at, (pair[0] ?? 0) * length / 2, (pair[1] ?? 0) * breadth / 2, angle); });
		const faces = corners.map(function (a, index) { const b = corners[(index + 1) % 4] ?? a; return { a, b, depth: a.x + a.y + b.x + b.y }; }).sort(function (a, b) { return a.depth - b.depth; });
		for (const face of faces) path([project(face.a, z), project(face.b, z), project(face.b, z + tall), project(face.a, z + tall)], face.a.x > face.b.x ? palette.side : palette.top, palette.edge);
		path(corners.map(function (corner) { return project(corner, z + tall); }), palette.top, palette.edge);
	};
	const ground = [{ x: 0, y: 0 }, { x: ARENA.width, y: 0 }, { x: ARENA.width, y: ARENA.height }, { x: 0, y: ARENA.height }];
	path(ground.map(function (at) { return project(at); }), '#303b40', '#647275');
	// An industrial concrete apron, with decorative terrain that never blocks fire.
	for (let x = 0; x < ARENA.width; x += 120) for (let y = 0; y < ARENA.height; y += 120) {
		const tone = (x / 120 + y / 120) % 3 === 0 ? '#354046' : '#303c41';
		path([{ x, y }, { x: x + 120, y }, { x: x + 120, y: y + 120 }, { x, y: y + 120 }].map(function (at) { return project(at); }), tone, '#40505655');
	}
	for (let i = 0; i < 90; i++) {
		const at = { x: (i * 317 + 71) % ARENA.width, y: (i * 173 + 80) % ARENA.height };
		disc(at, 4 + i % 12, '#202c3280');
		if (i % 3 === 0) line(at, { x: at.x + 24, y: at.y + 10 }, '#5a626350');
	}
	for (let x = 50; x < ARENA.width; x += 110) {
		line({ x, y: 25 }, { x: x + 38, y: 25 }, '#b49a60', 5);
		line({ x, y: ARENA.height - 25 }, { x: x + 38, y: ARENA.height - 25 }, '#b49a60', 5);
	}
	const relay = { x: ARENA.relayX, y: ARENA.relayY };
	disc(relay, 130, '#1b2a3280'); disc(relay, 130, '#688b8a', true);
	for (const offset of [-90, 90]) line({ x: relay.x + offset, y: relay.y - 100 }, { x: relay.x + offset, y: relay.y + 100 }, '#8ba69b77', 3);
	for (const wreck of state.wrecks) { disc(wreck, 40, '#0e181c88'); box(wreck, 32, 29, 0, 8, dark, wreck.angle); }
	for (const warning of state.warnings) {
		disc(warning, 45 + Math.sin(state.time * 8) * 5, '#f3a16c', true);
		const at = project(warning, 10); ctx.fillStyle = '#f3ae7f'; ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.fillText('INBOUND', at.x, at.y - 20);
	}
	for (const salvage of state.salvage) {
		disc(salvage, 27, salvage.kind === 'repair' ? '#74cfb740' : '#75cce540');
		const color = salvage.kind === 'repair' ? '#82dfbb' : '#8bdcec';
		box(salvage, 17, 17, 5 + Math.sin(state.time * 2) * 2, 12, { top: color, side: '#2c666b', edge: '#c6eee2' });
		const at = project(salvage, 30); ctx.font = '10px monospace'; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(salvage.kind === 'repair' ? '+' : '❄', at.x, at.y);
	}
	const mech = function (at: Point, turret: number, player: boolean, hp: number, maxHp: number, gait: WalkerGait, kind: EnemyKind = 'striker') {
		const hull = gait.body.angle;
		const palette = player ? steel : enemies[kind]; const size = player ? 1 : mechScale(kind);
		disc(at, 35 * size, '#050d1455');
		// Rear-set knees and forward ankles keep the digitigrade silhouette visible
		// even at rest. Each rigid segment follows its projected joint endpoints.
		const limb = function (a: Point, az: number, b: Point, bz: number, width: number, color: string) {
			const from = project(a, az); const to = project(b, bz);
			const length = Math.hypot(to.x - from.x, to.y - from.y);
			if (length < 0.001) return;
			const nx = -(to.y - from.y) / length * width / 2;
			const ny = (to.x - from.x) / length * width / 2;
			path([{ x: from.x + nx, y: from.y + ny }, { x: to.x + nx, y: to.y + ny }, { x: to.x - nx, y: to.y - ny }, { x: from.x - nx, y: from.y - ny }], color, palette.edge);
		};
		const feet = gait.feet.map(function (foot, index) { return { foot, index }; }).sort(function (a, b) { return a.foot.x + a.foot.y - b.foot.x - b.foot.y; });
		for (const { foot, index } of feet) {
			const { hip, knee, ankle } = legJoints({ ...at, angle: hull }, foot, index === 0 ? 0 : 1, size);
			box(foot, 38 * size, 18 * size, foot.lift, 7 * size, dark, foot.angle);
			for (const toe of [-1, 1]) box(local(foot, 15 * size, toe * 6 * size, foot.angle), 15 * size, 6 * size, foot.lift, 5 * size, palette, foot.angle);
			limb(hip, hip.z, knee, knee.z, 12 * size, dark.side);
			limb(knee, knee.z, ankle, ankle.z, 14 * size, palette.top);
			limb(local(knee, 5 * size, 0, hull), knee.z - size, ankle, ankle.z + 3 * size, 3 * size, steel.edge);
			box(knee, 14 * size, 17 * size, knee.z - 4 * size, 9 * size, dark, hull);
			box(ankle, 13 * size, 14 * size, ankle.z - 3 * size, 9 * size, palette, foot.angle);
		}
		box(at, 25 * size, 37 * size, 45 * size, 12 * size, dark, hull);
		// The fixed isometric view looks toward the origin from positive X/Y.
		const frontFacesCamera = Math.cos(turret) + Math.sin(turret) > 1e-10;
		const drawArm = function (side: -1 | 1) {
			const shoulder = local(at, -7 * size, side * 33 * size, turret);
			box(shoulder, 26 * size, 18 * size, 49 * size, 16 * size, palette, turret);
			box(local(shoulder, 22 * size, 0, turret), 35 * size, 8 * size, 51 * size, 8 * size, dark, turret);
			box(local(shoulder, -4 * size, 0, turret), 22 * size, 23 * size, 70 * size, 19 * size, player ? amber : palette, turret);
			// Recessed ports belong to the rack's front face, not separate boxes
			// painted over its roof and rear. Suppress edge-on roundoff as well.
			if (frontFacesCamera) for (const offset of [-7, 0, 7]) for (const z of [75, 82]) {
				const a = local(shoulder, 7 * size, (offset - 2) * size, turret);
				const b = local(shoulder, 7 * size, (offset + 2) * size, turret);
				path([project(a, z * size), project(b, z * size), project(b, (z + 4) * size), project(a, (z + 4) * size)], dark.side, dark.edge);
			}
		};
		// The arms sit outside the cockpit's side bounds. Draw the far arm
		// behind it and the near arm in front as the turret changes heading.
		const farSide = Math.cos(turret) - Math.sin(turret) >= 0 ? -1 : 1;
		drawArm(farSide);
		box(local(at, -5 * size, 0, turret), 35 * size, 41 * size, 54 * size, 20 * size, palette, turret);
		// Long, low cockpit projects between the two raised weapon pods.
		box(local(at, 17 * size, 0, turret), 34 * size, 27 * size, 53 * size, 16 * size, palette, turret);
		box(local(at, 29 * size, 0, turret), 10 * size, 23 * size, 64 * size, 6 * size, { top: player ? '#9fe5e7' : '#ffae7e', side: '#255b6d', edge: '#c4fcf4' }, turret);
		drawArm(farSide === -1 ? 1 : -1);

		if (player && state.player.heat > 60) {
			const vent = project(local(at, -23, 0, hull), 70 + (state.time * 25) % 24);
			ctx.fillStyle = '#b3c4cf44'; ctx.beginPath(); ctx.arc(vent.x, vent.y, 6 + state.player.heat / 15, 0, TAU); ctx.fill();
		}
		if (!player && hp < maxHp) {
			const bar = project(at, 105 * size); ctx.fillStyle = '#0a151b'; ctx.fillRect(bar.x - 22, bar.y, 44, 4); ctx.fillStyle = '#df9d7b'; ctx.fillRect(bar.x - 22, bar.y, 44 * Math.max(0, hp) / maxHp, 4);
		}
	};
	const things: { depth: number; draw: () => void }[] = state.enemies.map(function (enemy) {
		return { depth: enemy.x + enemy.y, draw: function () { mech(enemy, enemy.angle, false, enemy.hp, enemy.maxHp, options.gaits.enemies.get(enemy.id) ?? createGait(enemy, mechScale(enemy.kind)), enemy.kind); } };
	});
	things.push({ depth: relay.x + relay.y, draw: function () {
		box(relay, 90, 90, 0, 12, dark); box(relay, 55, 55, 12, 25, steel); box(relay, 18, 18, 37, 90, dark);
		for (const z of [50, 75, 100]) box(relay, 30, 30, z, 6, { top: '#9ad9d8', side: '#427d88', edge: '#a5ffff' });
		const beacon = project(relay, 145); ctx.fillStyle = '#c4ffed'; ctx.shadowColor = '#81ffdd'; ctx.shadowBlur = 15; ctx.beginPath(); ctx.arc(beacon.x, beacon.y, 4, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
		const label = project(relay, 165); ctx.font = '10px monospace'; ctx.fillStyle = '#b6d6d2'; ctx.textAlign = 'center'; ctx.fillText('RELAY 09', label.x, label.y);
	} });
	things.push({ depth: state.player.x + state.player.y, draw: function () { mech(state.player, state.player.turret, true, state.player.hp, 100, options.gaits.player); } });
	things.sort(function (a, b) { return a.depth - b.depth; }).forEach(function (thing) { thing.draw(); });
	if (state.beam) {
		ctx.shadowColor = '#67f5f6'; ctx.shadowBlur = 20;
		line(state.player, state.beam, '#5de9e599', 9, 42); line(state.player, state.beam, '#dbffff', 2.5, 42); ctx.shadowBlur = 0;
		disc(state.beam, 8, '#b1ffff', false, 42);
	}
	for (const shot of state.shots) {
		const trail = { x: shot.x - shot.vx * (shot.kind === 'missile' ? 0.12 : 0.04), y: shot.y - shot.vy * (shot.kind === 'missile' ? 0.12 : 0.04) };
		const color = shot.kind === 'enemy' ? '#ff8866' : '#ffd290';
		ctx.shadowColor = color; ctx.shadowBlur = 10;
		line(trail, shot, shot.kind === 'missile' ? '#d7d6c688' : color, shot.kind === 'cannon' ? 5 : 2, 42);
		const at = project(shot, 42); ctx.fillStyle = color; ctx.fillRect(at.x - 2, at.y - 2, 4, 4); ctx.shadowBlur = 0;
	}
	for (const effect of state.effects) {
		const at = project(effect, 36); const progress = 1 - effect.life * 2;
		ctx.globalAlpha = Math.min(1, effect.life * 2); ctx.strokeStyle = effect.color; ctx.lineWidth = 2;
		ctx.beginPath(); ctx.arc(at.x, at.y, Math.max(1, effect.size * progress), 0, TAU); ctx.stroke();
		for (let i = 0; i < 7; i++) {
			const angle = i * 2.4 + effect.x; const radius = effect.size * progress;
			ctx.fillStyle = i % 2 ? effect.color : '#edf3d4'; ctx.fillRect(at.x + Math.cos(angle) * radius, at.y + Math.sin(angle) * radius - progress * 15, 3, 3);
		}
	}
	ctx.globalAlpha = 1;
	const target = [...state.enemies].sort(function (a, b) { return distance(a, aim) - distance(b, aim); })[0];
	if (target && distance(target, aim) < 80) {
		const at = project(target, 42); ctx.strokeStyle = '#f6b574'; ctx.lineWidth = 1.5; ctx.strokeRect(at.x - 30, at.y - 40, 60, 65);
		ctx.font = '9px monospace'; ctx.fillStyle = '#ffcb93'; ctx.textAlign = 'center'; ctx.fillText(target.kind.toUpperCase(), at.x, at.y - 49);
	}
	const reticle = project(aim, 0); ctx.strokeStyle = '#c2e8e0aa'; ctx.lineWidth = 1;
	ctx.beginPath(); ctx.ellipse(reticle.x, reticle.y, 15, 8, 0, 0, TAU); ctx.moveTo(reticle.x - 23, reticle.y); ctx.lineTo(reticle.x - 9, reticle.y); ctx.moveTo(reticle.x + 9, reticle.y); ctx.lineTo(reticle.x + 23, reticle.y); ctx.stroke();
	const barrel = local(state.player, 110, 0, state.player.turret); line(state.player, barrel, '#b5e4e044', 1, 0);
	ctx.restore();
	// Screen-space direction markers keep distant threats discoverable.
	for (const enemy of state.enemies) {
		const at = worldToScreen(enemy, camera, 40);
		const margin = 45; if (at.x > margin && at.x < width - margin && at.y > 80 && at.y < height - 130) continue;
		const dx = at.x - width / 2; const dy = at.y - height * 0.52;
		const factor = Math.min((width / 2 - margin) / Math.max(1, Math.abs(dx)), (height / 2 - 105) / Math.max(1, Math.abs(dy)));
		const x = width / 2 + dx * factor; const y = height * 0.52 + dy * factor;
		ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx)); ctx.fillStyle = '#eead7c'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill(); ctx.restore();
	}
	if (options.showRadar) {
		const w = 144; const h = 96; const x = width - w - 24; const y = 92;
		ctx.fillStyle = '#081721bb'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#6c929355'; ctx.strokeRect(x, y, w, h);
		const dot = function (at: Point, color: string, radius: number) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + at.x / ARENA.width * w, y + at.y / ARENA.height * h, radius, 0, TAU); ctx.fill(); };
		dot(relay, '#83dad7', 3); dot(state.player, '#edf1dd', 3);
		for (const enemy of state.enemies) dot(enemy, '#f0a273', enemy.kind === 'siege' ? 3 : 2);
		for (const warning of state.warnings) dot(warning, '#f0a27388', 4);
		ctx.font = '8px monospace'; ctx.fillStyle = '#94b1b8'; ctx.fillText('TACTICAL / 1.8 × 1.2 KM', x + 8, y + h + 15);
	}
	const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.2, width / 2, height / 2, Math.max(width, height) * 0.7);
	vignette.addColorStop(0, '#03101a00'); vignette.addColorStop(1, '#03101a99'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
};
