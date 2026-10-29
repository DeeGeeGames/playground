import { line, polygon, prism, type Outline } from './drawing';
import { journeyAt } from './journey';
import { project, toScreen, type View } from './projection';
import type { Point } from './simulation';

interface Vertex extends Point { z: number }
interface Face {
	points: readonly Point[];
	seams: readonly (readonly [Point, Point])[];
	color: string;
	depth: number;
}

const HULL_LENGTH = 360;
const HULL_BEAM = 88;
const HULL_HEIGHT = 91;
const HULL_CENTER = -60;
const BRIDGE_X = -180;
const BRIDGE_HALF_LENGTH = 72;

const hullAt = function (x: number, angle: number, offset = 0): Vertex {
	const radius = Math.sqrt(Math.max(0, 1 - (x / HULL_LENGTH) ** 2));
	return { x, y: HULL_BEAM * radius * Math.sin(angle), z: HULL_CENTER + HULL_HEIGHT * radius * Math.cos(angle) + offset };
};

const upperHullAt = function (x: number, y: number): number {
	return HULL_CENTER + HULL_HEIGHT * Math.sqrt(Math.max(0, 1 - (x / HULL_LENGTH) ** 2 - (y / HULL_BEAM) ** 2));
};

const subtract = function (a: Vertex, b: Vertex): Vertex { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; };
const screenVertex = function (point: Vertex): Point { return project(point, point.z); };

// Build and shade the armor once. The fixed isometric camera lets each frame
// reuse projected faces without rebuilding or sorting them.
const makeMesh = function (sample: (axial: number, angle: number) => Vertex, columns: number, rows: number, upperHalf = false): readonly Face[] {
	const faces: Face[] = [];
	for (let column = 0; column < columns; column++) {
		const start = -Math.PI / 2 + column / columns * Math.PI;
		const end = -Math.PI / 2 + (column + 1) / columns * Math.PI;
		for (let row = 0; row < rows; row++) {
			const angle = (upperHalf ? -Math.PI / 2 : -Math.PI) + row / rows * Math.PI * (upperHalf ? 1 : 2);
			const nextAngle = angle + Math.PI / rows * (upperHalf ? 1 : 2);
			const a = sample(start, angle);
			const b = sample(start, nextAngle);
			const c = sample(end, nextAngle);
			const d = sample(end, angle);
			// Diagonals give an outward face normal even at the rounded end caps.
			const u = subtract(d, b);
			const v = subtract(c, a);
			const normal = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
			const magnitude = Math.hypot(normal.x, normal.y, normal.z);
			if (magnitude < 0.0001 || normal.x + normal.y + normal.z <= 0) continue;
			const light = Math.max(0, (-0.2 * normal.x + 0.4 * normal.y + normal.z) / (magnitude * Math.sqrt(1.2)));
			const panel = ((column * 7 + row * 3) % 9 - 4) * 0.006;
			const shade = 0.34 + light * 0.66 + panel;
			const color = `rgb(${Math.round(106 * shade)}, ${Math.round(117 * shade)}, ${Math.round(126 * shade)})`;
			const points = [a, b, c, d].map(screenVertex);
			const seams: [Point, Point][] = [];
			if (column % 2 === 0) seams.push([screenVertex(a), screenVertex(b)]);
			if (row % 4 === 0) seams.push([screenVertex(b), screenVertex(c)]);
			faces.push({ points, seams, color, depth: [a, b, c, d].reduce(function (total, point) { return total + point.x + point.y + point.z; }, 0) / 4 });
		}
	}
	return faces.sort(function (a, b) { return a.depth - b.depth; });
};

const hullMesh = makeMesh(function (axial, angle) { return hullAt(HULL_LENGTH * Math.sin(axial), angle); }, 24, 32);
const bridgeAt = function (x: number, angle: number): Vertex {
	const radius = Math.sqrt(Math.max(0, 1 - ((x - BRIDGE_X) / BRIDGE_HALF_LENGTH) ** 2));
	const y = 24 * radius * Math.sin(angle);
	return { x, y, z: upperHullAt(x, y) + 56 * radius * Math.cos(angle) };
};
const bridgeMesh = makeMesh(function (axial, angle) { return bridgeAt(BRIDGE_X + BRIDGE_HALF_LENGTH * Math.sin(axial), angle); }, 14, 16, true);

const drawMesh = function (ctx: CanvasRenderingContext2D, view: View, faces: readonly Face[]) {
	ctx.save();
	ctx.translate(view.cx, view.cy);
	ctx.scale(view.scale, view.scale);
	for (const face of faces) {
		// Matching edge color closes antialiasing gaps without a wireframe grid.
		ctx.lineWidth = 0.8;
		polygon(ctx, face.points, face.color, face.color);
		for (const [a, b] of face.seams)
			line(ctx, a, b, '#18242e66', 0.7);
	}
	ctx.restore();
};

const surfaceLine = function (ctx: CanvasRenderingContext2D, view: View, a: Vertex, b: Vertex, color: string, width = 1) {
	line(ctx, toScreen(a, view, a.z), toScreen(b, view, b.z), color, Math.max(0.5, width * view.scale));
};

const patch = function (ctx: CanvasRenderingContext2D, view: View, x: number, end: number, angle: number, nextAngle: number, fill: string, stroke?: string) {
	const points = [hullAt(x, angle, 0.8), hullAt(x, nextAngle, 0.8), hullAt(end, nextAngle, 0.8), hullAt(end, angle, 0.8)];
	ctx.lineWidth = Math.max(0.4, 0.65 * view.scale);
	polygon(ctx, points.map(function (point) { return toScreen(point, view, point.z); }), fill, stroke);
};

const drawHullDetails = function (ctx: CanvasRenderingContext2D, view: View) {
	// Recessed light belts follow the curved shoulders and lower belly.
	for (const angle of [1.03, 1.78]) {
		for (let x = -280; x < 280; x += 20) {
			patch(ctx, view, x, x + 20, angle - 0.045, angle + 0.045, '#14212b', '#3b4851');
			for (const dx of [4, 12])
				surfaceLine(ctx, view, hullAt(x + dx, angle, 1.4), hullAt(x + dx + 3, angle, 1.4), dx === 4 ? '#d4b17b' : '#8c7d65', 1.2);
		}
	}
	// Fore and aft service covers wrap around the shell instead of forming a deck.
	for (const x of [-300, -258, 166, 210, 254]) {
		for (const angle of [-0.34, 0.18, 0.57]) {
			patch(ctx, view, x, x + 34, angle, angle + 0.28, '#596671', '#859198');
			surfaceLine(ctx, view, hullAt(x + 5, angle + 0.04, 1.4), hullAt(x + 27, angle + 0.04, 1.4), '#a1aaad', 0.7);
		}
	}
	const start = screenVertex(hullAt(220, 0, 2));
	const end = screenVertex(hullAt(250, 0, 2));
	ctx.save();
	ctx.translate(view.cx + (start.x + end.x) / 2 * view.scale, view.cy + (start.y + end.y) / 2 * view.scale);
	ctx.rotate(Math.atan2(end.y - start.y, end.x - start.x));
	ctx.fillStyle = '#b2bab9';
	ctx.font = `${Math.max(5, 10 * view.scale)}px ui-monospace, monospace`;
	ctx.textAlign = 'center';
	ctx.fillText('ARK–07', 0, 0);
	ctx.restore();
};

const drawDrives = function (ctx: CanvasRenderingContext2D, view: View, time: number, reducedMotion: boolean) {
	const moving = journeyAt(time).speed > 0;
	const length = moving ? 68 + (reducedMotion ? 0 : Math.sin(time * 17) * 5) : 8;
	for (const y of [-28, 28]) {
		for (const z of [-79, -37]) {
			prism(ctx, view, { x: -325, y }, [[-31, -16], [31, -16], [31, 16], [-31, 16]], z - 14, z + 14, '#586773', '#303e49', 0, '#89969d');
			const start = toScreen({ x: -357, y }, view, z);
			const end = toScreen({ x: -374 - length, y }, view, z);
			const glow = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
			glow.addColorStop(0, '#f4cf95');
			glow.addColorStop(0.2, '#9fd8e0b0');
			glow.addColorStop(1, '#79c5df00');
			ctx.fillStyle = glow;
			const plume: Outline = [[-358, y - 11], [-374 - length, y - 3], [-385 - length, y], [-374 - length, y + 3], [-358, y + 11]];
			ctx.beginPath();
			for (const [index, [x, across]] of plume.entries()) {
				const at = toScreen({ x, y: across }, view, z);
				if (index === 0) ctx.moveTo(at.x, at.y); else ctx.lineTo(at.x, at.y);
			}
			ctx.closePath();
			ctx.fill();
			const aperture: Outline = [[y - 13, z - 10], [y + 13, z - 10], [y + 13, z + 10], [y - 13, z + 10]];
			polygon(ctx, aperture.map(function ([across, height]) { return toScreen({ x: -357, y: across }, view, height); }), '#151f29', '#75818a');
			surfaceLine(ctx, view, { x: -358, y: y - 9, z }, { x: -358, y: y + 9, z }, '#f5ce8c', 3);
		}
	}
};

export const drawArkHull = function (ctx: CanvasRenderingContext2D, view: View, time: number, reducedMotion: boolean) {
	ctx.save();
	drawDrives(ctx, view, time, reducedMotion);
	drawMesh(ctx, view, hullMesh);
	drawHullDetails(ctx, view);
	ctx.restore();
};

export const drawArkBridge = function (ctx: CanvasRenderingContext2D, view: View) {
	ctx.save();
	drawMesh(ctx, view, bridgeMesh);
	// A low glazed command housing grows out of the shell, with no terrace stack.
	for (let x = -212; x < -146; x += 6) {
		surfaceLine(ctx, view, bridgeAt(x, 0.95), bridgeAt(x + 3, 0.95), '#e0c38e', 1.5);
	}
	for (const [x, y, top] of [[-196, -4, 96], [-180, 0, 106], [-163, 3, 93]] as const) {
		const radius = Math.sqrt(Math.max(0, 1 - ((x - BRIDGE_X) / BRIDGE_HALF_LENGTH) ** 2 - (y / 24) ** 2));
		const z = upperHullAt(x, y) + 56 * radius;
		surfaceLine(ctx, view, { x, y, z }, { x, y, z: top }, '#a3b0b6', 1);
	}
	ctx.restore();
};

export const drawArkShield = function (ctx: CanvasRenderingContext2D, view: View) {
	const center = toScreen({ x: 0, y: 0 }, view, -45);
	ctx.save();
	ctx.beginPath();
	ctx.ellipse(center.x, center.y, 430 * view.scale, 170 * view.scale, Math.PI / 6, 0, Math.PI * 2);
	ctx.fillStyle = '#88f1e408';
	ctx.fill();
	ctx.lineWidth = 2;
	ctx.strokeStyle = '#88f1e4';
	ctx.stroke();
	ctx.restore();
};
