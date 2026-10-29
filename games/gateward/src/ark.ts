import { line, polygon, prism, type Outline } from './drawing';
import { journeyAt } from './journey';
import { DECK_HEIGHT, toScreen, type View } from './projection';
import type { Point } from './simulation';

const center: Point = { x: 0, y: 0 };
const hull: Outline = [[-184, -44], [-162, -66], [110, -66], [190, -34], [220, -14], [220, 14], [190, 34], [110, 66], [-162, 66], [-184, 44]];
const deck: Outline = [[-180, -39], [-158, -61], [108, -61], [187, -30], [215, -11], [215, 11], [187, 30], [108, 61], [-158, 61], [-180, 39]];
const keel: Outline = hull.map(function ([x, y]) { return [x * 0.94, y * 0.78]; });
const citadel: Outline = [[-169, -25], [-152, -29], [92, -29], [167, -10], [181, 0], [167, 10], [92, 29], [-152, 29], [-169, 25]];
const armorColors = ['#555e65', '#60696f', '#505a62', '#59636a'];

const plate = function (ctx: CanvasRenderingContext2D, view: View, shape: Outline, elevation: number, fill: string, stroke = '#303a43') {
	ctx.lineWidth = Math.max(0.5, view.scale * 0.65);
	polygon(ctx, shape.map(function ([x, y]) { return toScreen({ x, y }, view, elevation); }), fill, stroke);
};

const seam = function (ctx: CanvasRenderingContext2D, view: View, a: Point, b: Point, elevation: number, color = '#879097', width = 0.65) {
	line(ctx, toScreen(a, view, elevation), toScreen(b, view, elevation), color, Math.max(0.4, width * view.scale));
};

const block = function (ctx: CanvasRenderingContext2D, view: View, x: number, y: number, length: number, width: number, bottom: number, top: number, fill = '#687178') {
	prism(ctx, view, { x, y }, [[-length / 2, -width / 2], [length / 2, -width / 2], [length / 2, width / 2], [-length / 2, width / 2]], bottom, top, fill, '#303b45', 0, '#818b91');
};

const drawDrives = function (ctx: CanvasRenderingContext2D, view: View, time: number, reducedMotion: boolean) {
	const moving = journeyAt(time).speed > 0;
	const length = moving ? 75 + (reducedMotion ? 0 : Math.sin(time * 17) * 5) : 10;
	for (const y of [-34, 34]) {
		for (const z of [-17, 6]) {
			const start = toScreen({ x: -184, y }, view, z);
			const end = toScreen({ x: -196 - length, y }, view, z);
			const glow = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
			glow.addColorStop(0, '#f4cf95');
			glow.addColorStop(0.2, '#9fd8e0b0');
			glow.addColorStop(1, '#79c5df00');
			ctx.fillStyle = glow;
			const points: Outline = [[-187, y - 10], [-199 - length, y - 3], [-210 - length, y], [-199 - length, y + 3], [-187, y + 10]];
			ctx.beginPath();
			for (const [index, point] of points.entries()) {
				const [x, across] = point;
				const at = toScreen({ x, y: across }, view, z);
				if (index === 0) ctx.moveTo(at.x, at.y); else ctx.lineTo(at.x, at.y);
			}
			ctx.closePath();
			ctx.fill();
			// Four recessed drive apertures form a two-by-two stern cluster.
			const aperture: Outline = [[y - 13, z - 8], [y + 13, z - 8], [y + 13, z + 8], [y - 13, z + 8]];
			polygon(ctx, aperture.map(function ([across, height]) {
				return toScreen({ x: -188, y: across }, view, height);
			}), '#151f29', '#75818a');
			seam(ctx, view, { x: -190, y: y - 8 }, { x: -190, y: y + 8 }, z, '#f5ce8c', 3);
		}
	}
};

const drawHullSides = function (ctx: CanvasRenderingContext2D, view: View) {
	for (const [index, [x, y]] of hull.entries()) {
		const next = hull[(index + 1) % hull.length];
		const inset = deck[index];
		const nextInset = deck[(index + 1) % deck.length];
		const low = keel[index];
		const nextLow = keel[(index + 1) % keel.length];
		if (!next || !inset || !nextInset || !low || !nextLow) continue;
		const a = { x, y };
		const b = { x: next[0], y: next[1] };
		if (toScreen(b, view).x >= toScreen(a, view).x) continue;
		const side = function (bottom: number, top: number, fill: string) {
			polygon(ctx, [toScreen(a, view, top), toScreen(b, view, top), toScreen(b, view, bottom), toScreen(a, view, bottom)], fill, '#19242e');
		};
		side(-17, 13, y > 0 ? '#39434c' : '#303a44');
		side(-1, 8, '#111c25');
		polygon(ctx, [toScreen(a, view, 13), toScreen(b, view, 13), toScreen({ x: nextInset[0], y: nextInset[1] }, view, DECK_HEIGHT), toScreen({ x: inset[0], y: inset[1] }, view, DECK_HEIGHT)], '#697279', '#818a90');
		polygon(ctx, [toScreen(a, view, -17), toScreen(b, view, -17), toScreen({ x: nextLow[0], y: nextLow[1] }, view, -37), toScreen({ x: low[0], y: low[1] }, view, -37)], '#29343e', '#141f29');
		const length = Math.hypot(b.x - a.x, b.y - a.y);
		for (let offset = 8; offset < length - 5; offset += 9) {
			const at = function (along: number): Point { return { x: a.x + (b.x - a.x) * along / length, y: a.y + (b.y - a.y) * along / length }; };
			seam(ctx, view, at(offset), at(offset + 3), offset % 3 === 0 ? 2 : 4, offset % 4 === 0 ? '#e0bd82' : '#8a795e', 1.1);
		}
	}
	// Armored ribs bridge the dark habitation belt along both broadside flanks.
	for (const y of [-1, 1]) {
		for (const x of [-146, -94, -42, 10, 62]) {
			const point = { x, y: y * 65 };
			prism(ctx, view, point, [[-4, -3], [5, -3], [5, 3], [-4, 3]], -19, 16, '#737b80', '#46515b', 0, '#879096');
			seam(ctx, view, { x: x - 2, y: y * 69 }, { x: x + 3, y: y * 69 }, -13, '#9b8f75', 1);
		}
	}
};

const drawDeck = function (ctx: CanvasRenderingContext2D, view: View) {
	plate(ctx, view, deck, DECK_HEIGHT, '#515c65', '#90999e');
	// Large overlapping armor plates read at gameplay scale; fine seams stay subordinate.
	for (const side of [-1, 1]) {
		for (const [index, x] of [-153, -108, -63, -18, 27, 72].entries()) {
			plate(ctx, view, [[x, side * 27], [x + 40, side * 27], [x + 40, side * 59], [x, side * 59]], DECK_HEIGHT + 0.3, armorColors[index % armorColors.length] ?? '#59636a');
			seam(ctx, view, { x: x + 3, y: side * 57 }, { x: x + 36, y: side * 57 }, DECK_HEIGHT + 0.5);
			for (const dx of [5, 33])
				plate(ctx, view, [[x + dx, side * 30], [x + dx + 3, side * 30], [x + dx + 3, side * 34], [x + dx, side * 34]], DECK_HEIGHT + 0.5, '#8b9295', '#424c54');
		}
		plate(ctx, view, [[116, side * 27], [169, side * 18], [195, side * 25], [117, side * 57]], DECK_HEIGHT + 0.3, '#626c73');
		seam(ctx, view, { x: 127, y: side * 30 }, { x: 176, y: side * 24 }, DECK_HEIGHT + 0.5);
	}
	prism(ctx, view, center, citadel, DECK_HEIGHT + 1, 31, '#424e58', '#222e39', 0, '#76828b');
	for (const x of [-80, -33, 14, 61]) {
		plate(ctx, view, [[x, -21], [x + 39, -21], [x + 39, 21], [x, 21]], 31.5, '#59636b', '#2c3842');
		seam(ctx, view, { x: x + 3, y: -18 }, { x: x + 36, y: -18 }, 32, '#899195');
		for (const y of [-12, -7, -2, 3, 8])
			seam(ctx, view, { x: x + 8, y }, { x: x + 21, y }, 32, '#2e3b46', 1.5);
	}
	// Small access covers break up broad slabs without adding animated texture noise.
	for (const side of [-1, 1]) {
		for (const [index, x] of [-143, -119, -89, -57, -24, 8, 43, 78, 101].entries()) {
			const y = side * (index % 2 === 0 ? 53 : 30);
			plate(ctx, view, [[x, y - 3], [x + 8, y - 3], [x + 8, y + 3], [x, y + 3]], DECK_HEIGHT + 0.6, index % 3 === 0 ? '#343f49' : '#7b8386');
			seam(ctx, view, { x: x + 1, y: y - 2 }, { x: x + 6, y: y - 2 }, DECK_HEIGHT + 0.8, '#959d9e');
		}
	}
	// Paired bow ridges and a narrow axial trench reinforce the long wedge silhouette.
	for (const side of [-1, 1]) {
		plate(ctx, view, [[111, side * 4], [183, side * 4], [207, side * 9], [175, side * 15], [111, side * 24]], 24, '#737b80', '#8e969a');
		seam(ctx, view, { x: 119, y: side * 8 }, { x: 181, y: side * 8 }, 25, '#343f49', 2);
	}
	plate(ctx, view, [[115, -2], [203, -2], [211, 0], [203, 2], [115, 2]], 24.5, '#182630');
	for (const y of [-46, 46]) {
		block(ctx, view, -166, y, 20, 17, DECK_HEIGHT, 29, '#626e77');
		for (const x of [-172, -167, -162]) seam(ctx, view, { x, y: y - 6 }, { x, y: y + 6 }, 30, '#293640', 1.5);
	}
	const marking = toScreen({ x: 145, y: 0 }, view, 33);
	ctx.save();
	ctx.translate(marking.x, marking.y);
	ctx.rotate(Math.PI / 6);
	ctx.fillStyle = '#a3aaa9';
	ctx.font = `${Math.max(5, 9 * view.scale)}px ui-monospace, monospace`;
	ctx.textAlign = 'center';
	ctx.fillText('ARK–07', 0, 0);
	ctx.restore();
};

export const drawArkHull = function (ctx: CanvasRenderingContext2D, view: View, time: number, reducedMotion: boolean) {
	ctx.save();
	drawDrives(ctx, view, time, reducedMotion);
	drawHullSides(ctx, view);
	drawDeck(ctx, view);
	ctx.restore();
};

export const drawArkBridge = function (ctx: CanvasRenderingContext2D, view: View) {
	ctx.save();
	const aft = { x: -139, y: 0 };
	prism(ctx, view, { x: -124, y: 0 }, [[-43, -21], [36, -21], [47, -11], [47, 11], [36, 21], [-43, 21]], 31, 37, '#637079', '#303e49', 0, '#87939b');
	block(ctx, view, -105, 0, 32, 25, 37, 43, '#727e85');
	for (const y of [-8, 0, 8]) seam(ctx, view, { x: -116, y }, { x: -94, y }, 44, '#3a4852', 1.5);
	prism(ctx, view, aft, [[-29, -22], [26, -22], [36, -12], [36, 12], [26, 22], [-29, 22]], 31, 41, '#70797e', '#303e49', 0, '#929a9d');
	prism(ctx, view, aft, [[-20, -15], [12, -15], [21, -9], [21, 9], [12, 15], [-20, 15]], 41, 63, '#66727b', '#3b4854', 0, '#8b969d');
	block(ctx, view, -141, 0, 42, 37, 63, 69, '#7b8489');
	prism(ctx, view, aft, [[-14, -10], [7, -10], [13, -6], [13, 6], [7, 10], [-14, 10]], 69, 84, '#66747e', '#3a4853', 0, '#8d999f');
	block(ctx, view, -142, 0, 34, 30, 84, 89, '#8a9499');
	// Warm bridge slits, flying buttresses, and antennae echo a naval superstructure.
	for (const [z, x, width] of [[66, -139, 38], [86, -141, 30]] as const) {
		seam(ctx, view, { x: x - width / 2, y: 20 }, { x: x + width / 2, y: 20 }, z, '#202c35', 3);
		for (let dx = -width / 2 + 3; dx < width / 2; dx += 6)
			seam(ctx, view, { x: x + dx, y: 20.5 }, { x: x + dx + 2, y: 20.5 }, z, '#dfc591', 1.3);
	}
	for (const y of [-12, 12]) {
		line(ctx, toScreen({ x: -154, y }, view, 68), toScreen({ x: -123, y }, view, 41), '#929da3', Math.max(0.6, 2 * view.scale));
	}
	for (const [x, y, bottom, top] of [[-152, -7, 89, 112], [-141, 3, 94, 106], [-132, -5, 89, 102], [-161, 12, 41, 76]] as const) {
		line(ctx, toScreen({ x, y }, view, bottom), toScreen({ x, y }, view, top), '#a3b0b6', Math.max(0.6, view.scale));
	}
	block(ctx, view, -141, -2, 12, 9, 89, 94, '#667780');
	ctx.restore();
};
