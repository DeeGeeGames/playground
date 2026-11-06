import { driveLength, driveShape } from './effect-motion';
import { localPoint, type Point, type Ship, type State } from './simulation';
import { worldToScreen, type Camera } from './projection';
import { CEL } from './visual-theme';
import { MOUNT_SOCKETS, WEAPONS, type MountState } from './weapons';

export type Outline = readonly (readonly [number, number])[];
export const polygon = function (ctx: CanvasRenderingContext2D, points: readonly Point[], fill: string | CanvasGradient, stroke?: string, width = 1.4) {
	const first = points[0]; if (!first) return;
	ctx.beginPath(); ctx.moveTo(first.x, first.y);
	for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
	ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
	if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
};
export const line = function (ctx: CanvasRenderingContext2D, a: Point, b: Point, color: string, width = 1) {
	ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
};
const mirror = function (outline: Outline, sign: number): Outline {
	return outline.map(function ([f, a]) { return [f, a * sign] as const; });
};
const chamfer = function (f0: number, f1: number, a0: number, a1: number, cf: number, ca: number): Outline {
	return [[f0 + cf, a0], [f1 - cf, a0], [f1, a0 + ca], [f1, a1 - ca], [f1 - cf, a1], [f0 + cf, a1], [f0, a1 - ca], [f0, a0 + ca]];
};
const drawSocket = function (ctx: CanvasRenderingContext2D, camera: Camera, ship: Ship, slot: number, mount: MountState | null | undefined, reducedMotion: boolean) {
	const socket = MOUNT_SOCKETS[slot]; if (!socket) return;
	const origin = localPoint(ship, socket.forward, socket.across); const at = worldToScreen(origin, camera, 24);
	const radius = Math.max(2.6, camera.scale * 7);
	ctx.beginPath(); ctx.ellipse(at.x, at.y, radius, radius * 0.58, 0, 0, Math.PI * 2);
	ctx.fillStyle = CEL.ink; ctx.fill(); ctx.strokeStyle = CEL.side; ctx.lineWidth = Math.max(1, camera.scale * 1.8); ctx.stroke();
	if (!mount) return;
	const heading = mount.locked ? mount.lockHeading : mount.heading;
	const recoil = reducedMotion ? 0 : Math.min(2.4, mount.flash * 15);
	const screen = function (forward: number, across: number, elevation = 30) {
		return worldToScreen({ x: origin.x + Math.cos(heading) * (forward - recoil) - Math.sin(heading) * across,
			y: origin.y + Math.sin(heading) * (forward - recoil) + Math.cos(heading) * across }, camera, elevation);
	};
	const color = WEAPONS[mount.weapon].color;
	const plate = function (f0: number, f1: number, halfWidth: number, fill: string, elevation = 30) {
		polygon(ctx, [screen(f0, -halfWidth, elevation), screen(f1, -halfWidth, elevation), screen(f1, halfWidth, elevation), screen(f0, halfWidth, elevation)], fill, CEL.ink, Math.max(0.8, camera.scale));
	};
	const barrel = function (forward: number, across: number, length: number, width: number, fill = color) {
		line(ctx, screen(forward, across), screen(forward + length, across), CEL.ink, Math.max(2, width * camera.scale + 1.5));
		line(ctx, screen(forward, across), screen(forward + length, across), fill, Math.max(0.8, width * camera.scale));
	};
	plate(-6, 6, mount.weapon === 'flak' ? 7 : 5, CEL.top);
	if (mount.weapon === 'seeker') {
		plate(-6, 7, 6, CEL.side, 34);
		for (const f of [-3, 3]) for (const a of [-3, 3]) {
			const point = screen(f, a, 35); ctx.fillStyle = color;
			ctx.fillRect(point.x - Math.max(0.6, camera.scale), point.y - Math.max(0.6, camera.scale), Math.max(1.2, camera.scale * 2), Math.max(1.2, camera.scale * 2));
		}
	} else if (mount.weapon === 'rail') {
		barrel(2, -3.3, 24, 1.8); barrel(2, 3.3, 24, 1.8);
	} else if (mount.weapon === 'rattler') {
		for (const across of [-2.4, 0, 2.4]) barrel(3, across, 16, 1.1, CEL.top);
	} else if (mount.weapon === 'flak') {
		for (const across of [-4, 4]) { barrel(2, across, 12, 3); const tip = screen(14, across); ctx.beginPath(); ctx.arc(tip.x, tip.y, Math.max(1, 2.2 * camera.scale), 0, Math.PI * 2); ctx.fillStyle = CEL.ink; ctx.fill(); }
	} else if (mount.weapon === 'torpedo') {
		plate(-7, 16, 5, CEL.top, 32); barrel(16, -3, 0.7, 4, CEL.ink); barrel(-3, 0, 15, 1.5);
	} else if (mount.weapon === 'helios') {
		barrel(-2, -5, 22, 3); barrel(-2, 5, 22, 3); barrel(3, 0, 12, 4, CEL.cream);
	} else if (mount.weapon === 'ion') {
		barrel(2, 0, 14, 1.4, CEL.dark);
		for (const f of [4, 9, 14]) line(ctx, screen(f, -4), screen(f, 4), color, Math.max(1.1, camera.scale * 2));
	} else { barrel(2, 0, 14, 2.4); const tip = screen(16, 0); ctx.beginPath(); ctx.arc(tip.x, tip.y, Math.max(1.1, camera.scale * 3), 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
};

// Closed, layered pressure hulls share the approved split bow and twin drives.
// Keep broad faces quiet and reduce gun detail when a hull is small on screen.
export const drawStarship = function (ctx: CanvasRenderingContext2D, camera: Camera, ship: Ship, state: State, reducedMotion = false, plumeLength = driveLength(ship, state, reducedMotion)) {
	const player = ship.id === 0; const heavy = player || ship.length > 150; const alive = ship.hp > 0;
	const command = state.enemies.some(function (enemy) { return enemy.id === ship.id && enemy.command; });
	const top = !alive ? CEL.dark : player ? CEL.top : CEL.hostile;
	const side = !alive ? CEL.planetShade : player ? CEL.side : CEL.hostileSide;
	const emitter = !alive ? CEL.dark : player ? CEL.mint : CEL.amber;
	const h = heavy ? 1 : 0.75; const distant = ship.length * camera.scale < 110;
	const weight = Math.min(3.4, Math.max(1.1, camera.scale * 1.5));
	const screen = function (f: number, a: number, z = 0) { return worldToScreen(localPoint(ship, f * ship.length, a * ship.width), camera, z * h); };
	const points = function (outline: Outline, z: number) { return outline.map(function ([f, a]) { return screen(f, a, z); }); };
	const parts: { bottom: number; depth: number; paint: () => void }[] = [];
	const module = function (outline: Outline, bottom: number, height: number, fill: string = top, shade: string = side) {
		const low = points(outline, bottom); const high = points(outline, height);
		const center = outline.reduce(function (sum, p) { return { f: sum.f + p[0] / outline.length, a: sum.a + p[1] / outline.length }; }, { f: 0, a: 0 });
		const winding = Math.sign(outline.reduce(function (sum, p, i) { const q = outline[(i + 1) % outline.length]; return q ? sum + p[0] * q[1] - q[0] * p[1] : sum; }, 0));
		const faces: { depth: number; points: readonly Point[]; fill: string }[] = [];
		for (let i = 0; i < outline.length; i++) {
			const next = (i + 1) % outline.length; const p = outline[i]; const q = outline[next];
			const a = high[i]; const b = high[next]; const c = low[next]; const d = low[i];
			if (!p || !q || !a || !b || !c || !d) continue;
			const dx = (q[0] - p[0]) * ship.length; const dy = (q[1] - p[1]) * ship.width;
			if (winding * (dy * (Math.cos(ship.angle) + Math.sin(ship.angle)) - dx * (Math.cos(ship.angle) - Math.sin(ship.angle))) <= 0) continue;
			faces.push({ depth: (a.y + b.y) / 2, points: [a, b, c, d], fill: a.x < b.x ? shade : CEL.dark });
		}
		faces.sort(function (a, b) { return a.depth - b.depth; });
		parts.push({ bottom, depth: screen(center.f, center.a).y, paint: function () {
			for (const face of faces) polygon(ctx, face.points, face.fill, CEL.ink, weight);
			polygon(ctx, high, fill, CEL.ink, weight * 0.8);
		} });
	};
	const surface = function (outline: Outline, z: number, color: string) {
		parts.push({ bottom: z, depth: 0, paint: function () { polygon(ctx, points(outline, z), color, CEL.ink, weight * 0.65); } });
	};
	ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
	const drive = driveShape(ship.length, ship.width); const flame = plumeLength;
	for (const sign of alive ? [-1, 1] : []) {
		const at = worldToScreen(localPoint(ship, drive.forward, sign * drive.across), camera, drive.elevation);
		const tail = worldToScreen(localPoint(ship, drive.forward - flame, sign * drive.across), camera, drive.elevation);
		const dx = tail.x - at.x; const dy = tail.y - at.y; const length = Math.hypot(dx, dy);
		ctx.save(); ctx.translate(at.x, at.y); ctx.rotate(Math.atan2(dy, dx));
		for (const core of [false, true]) {
			const extent = length * (core ? 0.62 : 1); const radius = Math.max(0.7, drive.height * camera.scale) * (core ? 0.52 : 1);
			const gradient = ctx.createLinearGradient(0, 0, Math.max(0.1, extent), 0);
			gradient.addColorStop(0, core ? CEL.cream : emitter); gradient.addColorStop(1, `${core ? CEL.cream : emitter}00`);
			ctx.beginPath(); ctx.moveTo(0, -radius);
			ctx.bezierCurveTo(extent * 0.35, -radius, extent, -radius * 0.35, extent, 0);
			ctx.bezierCurveTo(extent, radius * 0.35, extent * 0.35, radius, 0, radius); ctx.closePath();
			ctx.fillStyle = gradient; ctx.fill();
		}
		ctx.restore();
	}
	module([[-0.48, -0.17], [0.29, -0.2], [0.57, -0.07], [0.57, 0.07], [0.29, 0.2], [-0.48, 0.17], [-0.55, 0]], 0, 22, CEL.dark, CEL.dark);
	for (const sign of [-1, 1]) {
		module(mirror([[-0.53, 0.23], [-0.39, 0.18], [0.2, 0.2], [heavy ? 0.35 : 0.2, heavy ? 0.34 : 0.3], [0.1, heavy ? 0.47 : 0.6], [-0.47, 0.49], [-0.57, 0.38]], sign), 3, 20);
		module(mirror([[-0.03, 0.18], [0.4, 0.09], [player ? 0.59 : heavy ? 0.48 : 0.53, 0.1], [0.36, player ? 0.33 : 0.39], [0.04, 0.34]], sign), 16, 27);
		surface(mirror([[-0.01, 0.21], [0.08, 0.2], [0.11, 0.33], [0.02, 0.34]], sign), 27.5, alive ? CEL.amber : CEL.dark);
		module(mirror(chamfer(-0.56, -0.38, 0.22, 0.49, 0.024, 0.05), sign), 4, 23, side, CEL.dark);
		// A rear-facing aperture is hidden at opposite headings, rather than
		// painting a light through the solid engine block.
		if (Math.cos(ship.angle) + Math.sin(ship.angle) < -0.01) {
			parts.push({ bottom: 24, depth: screen(-0.563, sign * 0.355).y, paint: function () {
				polygon(ctx, [screen(-0.563, sign * 0.355 - 0.065, 8), screen(-0.563, sign * 0.355 + 0.065, 8), screen(-0.563, sign * 0.355 + 0.065, 18), screen(-0.563, sign * 0.355 - 0.065, 18)], emitter, CEL.ink, weight * 1.3);
			} });
		}
		for (let i = 0; i < (player ? 6 : 4); i++) {
			const f = player ? (64 - i * 25) / ship.length : 0.22 - i * 0.16;
			const a = sign * 0.405; const halfF = 6 / ship.length; const halfA = 6 / ship.width;
			if (player && state.arsenal) {
				const slot = (sign < 0 ? 0 : 6) + i;
				parts.push({ bottom: 24, depth: screen(f, a).y, paint: function () { drawSocket(ctx, camera, ship, slot, state.arsenal?.mounts[slot], reducedMotion); } });
				continue;
			}
			module(chamfer(f - halfF, f + halfF, a - halfA, a + halfA, 2 / ship.length, 2 / ship.width), 20, 27, side, CEL.dark);
			parts.push({ bottom: 28, depth: screen(f, a).y, paint: function () {
				for (const offset of distant ? [0] : [-2.4, 2.4]) {
					const start = screen(f + offset / ship.length, a + sign * 0.035, 24);
					const end = screen(f + offset / ship.length, a + sign * 0.135, 24);
					line(ctx, start, end, CEL.ink, Math.max(2.4, (distant ? 6 : 4.8) * camera.scale));
					line(ctx, start, end, top, Math.max(1, (distant ? 2.5 : 2.3) * camera.scale));
					ctx.beginPath(); ctx.arc(end.x, end.y, Math.max(0.8, camera.scale * 1.4), 0, Math.PI * 2); ctx.fillStyle = CEL.ink; ctx.fill();
				}
			} });
		}
		if (!distant) for (let i = 0; i < 3; i++) {
			const f = -0.36 + i * 0.045;
			surface(mirror([[f, 0.22], [f + 0.015, 0.22], [f + 0.015, 0.29], [f, 0.29]], sign), 22, CEL.amber);
		}
	}
	module([[-0.4, 0], [-0.32, -0.12], [0.24, -0.09], [0.43, 0], [0.24, 0.09], [-0.32, 0.12]], 21, 33);
	surface([[-0.31, -0.023], [0.24, -0.023], [0.29, 0], [0.24, 0.023], [-0.31, 0.023]], 33.5, player ? CEL.dark : CEL.amber);
	surface([[-0.29, -0.016], [-0.13, -0.016], [-0.13, 0.016], [-0.29, 0.016]], 34, emitter);
	module([[-0.08, -0.085], [0.065, -0.085], [0.14, -0.038], [0.14, 0.038], [0.065, 0.085], [-0.08, 0.085], [-0.115, 0]], 33, 40);
	if (Math.cos(ship.angle) + Math.sin(ship.angle) > 0.01) {
		parts.push({ bottom: 41, depth: 0, paint: function () {
			polygon(ctx, [screen(0.14, -0.03, 36), screen(0.14, 0.03, 36), screen(0.14, 0.03, 39), screen(0.14, -0.03, 39)], emitter, CEL.ink, weight * 0.7);
			polygon(ctx, [screen(0.57, -0.055, 7), screen(0.57, 0.055, 7), screen(0.57, 0.055, 14), screen(0.57, -0.055, 14)], CEL.amber, CEL.ink, weight);
		} });
	}
	if (command) for (const sign of [-1, 1]) module(chamfer(-0.26, -0.16, sign * 0.11 - 0.04, sign * 0.11 + 0.04, 0.015, 0.018), 33, 45, CEL.amber);
	parts.sort(function (a, b) { return a.bottom - b.bottom || a.depth - b.depth; });
	for (const part of parts) part.paint();
	if (!distant) for (const sign of [-1, 1]) for (const f of [0.16, 0.32]) line(ctx, screen(f, sign * 0.15, 27.5), screen(f - 0.025, sign * 0.29, 27.5), side, Math.max(0.7, camera.scale * 0.75));
	const damage = 1 - ship.hp / ship.maxHp;
	for (let i = 0; i < 6; i++) {
		if (damage <= (i + 1) / 8) continue;
		const f = 0.15 + (i % 3) * 0.075; const a = (i < 3 ? -1 : 1) * 0.23;
		polygon(ctx, [screen(f - 0.017, a - 0.035, 28), screen(f + 0.025, a - 0.016, 28), screen(f + 0.01, a + 0.01, 28), screen(f + 0.03, a + 0.035, 28), screen(f - 0.014, a + 0.026, 28)], CEL.ink);
		if (alive && damage > 0.45) line(ctx, screen(f, a - 0.01, 28.5), screen(f + 0.012, a + 0.016, 28.5), CEL.amber, Math.max(1, camera.scale));
	}
	if (player && Math.abs(state.player.yaw) > 0.025) {
		const sign = Math.sign(state.player.yaw);
		line(ctx, screen(0.37, -sign * 0.19, 23), screen(0.37, -sign * 0.31, 23), CEL.mint, Math.max(1, 2.4 * camera.scale));
	}
	ctx.restore();
};
