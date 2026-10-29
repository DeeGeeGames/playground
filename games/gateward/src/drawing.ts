import { toScreen, type View } from './projection';
import type { Point } from './simulation';

export type Outline = readonly (readonly [number, number])[];

export const polygon = function (ctx: CanvasRenderingContext2D, points: readonly Point[], fill: string, stroke?: string) {
	const first = points[0];
	if (!first)
		return;
	ctx.beginPath();
	ctx.moveTo(first.x, first.y);
	for (const point of points.slice(1))
		ctx.lineTo(point.x, point.y);
	ctx.closePath();
	ctx.fillStyle = fill;
	ctx.fill();
	if (stroke) {
		ctx.strokeStyle = stroke;
		ctx.stroke();
	}
};

export const line = function (ctx: CanvasRenderingContext2D, a: Point, b: Point, color: string, width = 1) {
	ctx.beginPath();
	ctx.moveTo(a.x, a.y);
	ctx.lineTo(b.x, b.y);
	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.stroke();
};

export const local = function (point: Point, forward: number, across: number, angle: number): Point {
	return { x: point.x + Math.cos(angle) * forward - Math.sin(angle) * across, y: point.y + Math.sin(angle) * forward + Math.cos(angle) * across };
};

export const prism = function (ctx: CanvasRenderingContext2D, view: View, origin: Point, shape: Outline, bottom: number, top: number, color: string, side: string, angle = 0, stroke = '#7693a6') {
	const points = shape.map(function ([x, y]) { return local(origin, x, y, angle); });
	const high = points.map(function (point) { return toScreen(point, view, top); });
	const low = points.map(function (point) { return toScreen(point, view, bottom); });
	ctx.lineWidth = Math.max(0.6, view.scale);
	for (let i = 0; i < high.length; i++) {
		const next = (i + 1) % high.length;
		const a = high[i];
		const b = high[next];
		const c = low[next];
		const d = low[i];
		if (a && b && c && d && b.x < a.x)
			polygon(ctx, [a, b, c, d], side, '#142332');
	}
	polygon(ctx, high, color, stroke);
};
