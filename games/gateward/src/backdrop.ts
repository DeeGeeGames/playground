import { beaconAt, journeyAt } from './journey';
import { project, toScreen, type View } from './projection';
import type { Point } from './simulation';

const line = function (ctx: CanvasRenderingContext2D, a: Point, b: Point, color: string, width = 1) {
	ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
};
const label = function (ctx: CanvasRenderingContext2D, value: string, at: Point, color: string) {
	ctx.font = '9px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(value, at.x, at.y);
};
const polygon = function (ctx: CanvasRenderingContext2D, points: readonly Point[], color: string) {
	const first = points[0]; if (!first) return;
	ctx.beginPath(); ctx.moveTo(first.x, first.y); for (const point of points.slice(1)) ctx.lineTo(point.x, point.y); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
};

export const drawBackdrop = function (ctx: CanvasRenderingContext2D, view: View, time: number, reducedMotion: boolean) {
	const { width, height, scale } = view;
	const travel = journeyAt(time).distance;
	const drift = reducedMotion ? 0 : travel;
	const direction = project({ x: 1, y: 0 });
	ctx.fillStyle = '#080f19'; ctx.fillRect(0, 0, width, height);
	for (let i = 0; i < 145; i++) {
		const layer = i % 3; const parallax = [0.08, 0.2, 0.46][layer] ?? 0.08;
		const x = ((i * 173.73 - drift * direction.x * parallax * scale) % width + width) % width;
		const y = ((i * 97.31 - drift * direction.y * parallax * scale) % height + height) % height;
		ctx.fillStyle = layer === 2 ? '#708a9b' : '#2e4256'; ctx.fillRect(x, y, layer === 2 ? 2 : 1, 1);
	}
	// Distant rocks pass below the battle plane, with no collision or selection.
	for (let i = 0; i < 24; i++) {
		const rock = { x: -800 + ((i * 347 + 800 - drift * 0.72) % 2200 + 2200) % 2200, y: (i % 2 === 0 ? -1 : 1) * (350 + i * 83 % 280) };
		const radius = 18 + i * 11 % 27;
		const outline = [[-1, -0.3], [-0.3, -0.85], [0.7, -0.5], [1, 0.3], [0.2, 0.85], [-0.8, 0.6]] as const;
		const high = outline.map(function ([x, y]) { return toScreen({ x: rock.x + x * radius, y: rock.y + y * radius }, view, -75); });
		const low = high.map(function (p) { return { x: p.x, y: p.y + 15 * scale }; });
		polygon(ctx, low, '#0c1823'); polygon(ctx, high, '#172736');
		const a = high[0]; const b = high[1]; if (a && b) line(ctx, a, b, '#314655');
	}
	// A fixed navigation lattice slides under the ship, rather than staying
	// attached to its camera. Keep this decorative layer still in reduced motion.
	const gridOffset = drift % 160;
	for (let i = -7; i <= 7; i++) {
		const x = i * 160 - gridOffset;
		line(ctx, toScreen({ x, y: -900 }, view, -45), toScreen({ x, y: 900 }, view, -45), '#20384a55');
		line(ctx, toScreen({ x: -1600, y: i * 160 }, view, -45), toScreen({ x: 1600, y: i * 160 }, view, -45), '#20384a55');
	}
	ctx.setLineDash([5, 12]);
	line(ctx, toScreen({ x: -1600, y: 0 }, view), toScreen({ x: 1600, y: 0 }, view), '#355367'); ctx.setLineDash([]);
	for (let i = -8; i <= 8; i++) {
		const x = i * 140 - travel % 140;
		for (const side of [-1, 1]) {
			const y = side * 125;
			line(ctx, toScreen({ x: x - 10, y }, view), toScreen({ x: x + 10, y }, view), '#5c929c', 1.4);
		}
	}
	// Paired guide beacons are actual fixed milestones: each passes the ark
	// once, and the sixth marks the gate rather than looping past the camera.
	for (let i = 0; i <= 6; i++) {
		const point = beaconAt(i, time); if (Math.abs(point.x) > 950) continue;
		const passed = point.x < -35; const color = passed ? '#47616d' : '#9ce4d9';
		for (const side of [-1, 1]) {
			const p = { x: point.x, y: side * 140 };
			const base = toScreen(p, view, -20); const top = toScreen(p, view, 27);
			line(ctx, base, top, '#324f62', Math.max(2, 5 * scale));
			line(ctx, { x: top.x, y: top.y + 8 * scale }, top, color, Math.max(2, 4 * scale));
			line(ctx, toScreen({ x: p.x, y: p.y - 18 }, view, -20), toScreen({ x: p.x, y: p.y + 18 }, view, -20), '#345364');
		}
		const name = i === 0 ? 'DEPARTURE' : i === 6 ? 'KEPLER APPROACH' : `NAV ${String(i).padStart(2, '0')}`;
		label(ctx, name, toScreen({ x: point.x, y: 180 }, view, -5), passed ? '#526d7b' : '#7ca4ad');
	}
};
