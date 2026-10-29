import { line, polygon, prism, type Outline } from './drawing';
import { journeyAt } from './journey';
import { DECK_HEIGHT, toScreen, type View } from './projection';
import type { Point } from './simulation';

const center: Point = { x: 0, y: 0 };
// A broad clipped bow overhangs a deeply undercut keel. Most of the hull keeps
// its full beam, giving the ark the reference's slab-sided capital-ship profile.
const hull: Outline = [[-218, -58], [-192, -82], [163, -82], [218, -66], [234, -46], [234, 46], [218, 66], [163, 82], [-192, 82], [-218, 58]];
const deck: Outline = [[-210, -50], [-187, -70], [160, -70], [210, -55], [226, -39], [226, 39], [210, 55], [160, 70], [-187, 70], [-210, 50]];
const keel: Outline = [[-204, -44], [-184, -61], [150, -61], [178, -48], [183, -32], [183, 32], [178, 48], [150, 61], [-184, 61], [-204, 44]];
const citadel: Outline = [[-192, -25], [-178, -29], [96, -29], [109, -19], [109, 19], [96, 29], [-178, 29], [-192, 25]];
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

const taperedTier = function (ctx: CanvasRenderingContext2D, view: View, base: Outline, roof: Outline, bottom: number, top: number) {
	for (const [index, [x, y]] of base.entries()) {
		const nextIndex = (index + 1) % base.length;
		const next = base[nextIndex];
		const high = roof[index];
		const nextHigh = roof[nextIndex];
		if (!next || !high || !nextHigh) continue;
		const a = toScreen({ x, y }, view, bottom);
		const b = toScreen({ x: next[0], y: next[1] }, view, bottom);
		if (b.x >= a.x) continue;
		polygon(ctx, [a, b, toScreen({ x: nextHigh[0], y: nextHigh[1] }, view, top), toScreen({ x: high[0], y: high[1] }, view, top)], '#56636d', '#89959c');
	}
	plate(ctx, view, roof, top, '#768188', '#9ca5a9');
};

const drawDrives = function (ctx: CanvasRenderingContext2D, view: View, time: number, reducedMotion: boolean) {
	const moving = journeyAt(time).speed > 0;
	const length = moving ? 75 + (reducedMotion ? 0 : Math.sin(time * 17) * 5) : 10;
	for (const y of [-43, 43]) {
		for (const z of [-35, 0]) {
			prism(ctx, view, { x: -219, y }, [[-21, -19], [18, -19], [18, 19], [-21, 19]], z - 14, z + 14, '#5b6871', '#303e49', 0, '#8b979d');
			const start = toScreen({ x: -240, y }, view, z);
			const end = toScreen({ x: -252 - length, y }, view, z);
			const glow = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
			glow.addColorStop(0, '#f4cf95');
			glow.addColorStop(0.2, '#9fd8e0b0');
			glow.addColorStop(1, '#79c5df00');
			ctx.fillStyle = glow;
			const points: Outline = [[-242, y - 12], [-255 - length, y - 3], [-266 - length, y], [-255 - length, y + 3], [-242, y + 12]];
			ctx.beginPath();
			for (const [index, point] of points.entries()) {
				const [x, across] = point;
				const at = toScreen({ x, y: across }, view, z);
				if (index === 0) ctx.moveTo(at.x, at.y); else ctx.lineTo(at.x, at.y);
			}
			ctx.closePath();
			ctx.fill();
			// Four recessed drive apertures form a two-by-two stern cluster.
			const aperture: Outline = [[y - 15, z - 10], [y + 15, z - 10], [y + 15, z + 10], [y - 15, z + 10]];
			polygon(ctx, aperture.map(function ([across, height]) {
				return toScreen({ x: -241, y: across }, view, height);
			}), '#151f29', '#75818a');
			seam(ctx, view, { x: -243, y: y - 10 }, { x: -243, y: y + 10 }, z, '#f5ce8c', 3);
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
		side(-29, 13, y > 0 ? '#39434c' : '#303a44');
		side(-1, 8, '#111c25');
		polygon(ctx, [toScreen(a, view, 13), toScreen(b, view, 13), toScreen({ x: nextInset[0], y: nextInset[1] }, view, DECK_HEIGHT), toScreen({ x: inset[0], y: inset[1] }, view, DECK_HEIGHT)], '#697279', '#818a90');
		polygon(ctx, [toScreen(a, view, -29), toScreen(b, view, -29), toScreen({ x: nextLow[0], y: nextLow[1] }, view, -66), toScreen({ x: low[0], y: low[1] }, view, -66)], '#303b45', '#17232d');
		const length = Math.hypot(b.x - a.x, b.y - a.y);
		for (let offset = 8; offset < length - 5; offset += 9) {
			const at = function (along: number): Point { return { x: a.x + (b.x - a.x) * along / length, y: a.y + (b.y - a.y) * along / length }; };
			seam(ctx, view, at(offset), at(offset + 3), offset % 3 === 0 ? 2 : 4, offset % 4 === 0 ? '#e0bd82' : '#8a795e', 1.1);
		}
		// Panel seams continue down the sloping prow and belly, emphasizing depth.
		for (const fraction of [0.2, 0.5, 0.8]) {
			const upper = { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
			const lower = { x: low[0] + (nextLow[0] - low[0]) * fraction, y: low[1] + (nextLow[1] - low[1]) * fraction };
			line(ctx, toScreen(upper, view, -29), toScreen(lower, view, -66), '#53616b', Math.max(0.5, view.scale));
		}
	}
	// Broad armored casements and narrow ribs build up the visible broadside.
	for (const x of [-183, -128, -73, -18, 37, 92]) {
		prism(ctx, view, { x: x + 24, y: 83 }, [[-22, -2], [22, -2], [22, 3], [-22, 3]], -27, -5, '#67737c', '#46535d', 0, '#7b878e');
		prism(ctx, view, { x, y: 83 }, [[-3, -3], [4, -3], [4, 5], [-3, 5]], -32, 16, '#737b80', '#46515b', 0, '#879096');
		seam(ctx, view, { x: x + 7, y: 86.5 }, { x: x + 42, y: 86.5 }, -12, '#263641', 1);
		seam(ctx, view, { x: x + 13, y: 86.5 }, { x: x + 20, y: 86.5 }, -21, '#b5a686', 1);
	}
	for (const y of [-34, -12, 12, 34]) {
		for (const z of [-17, 12]) {
			seam(ctx, view, { x: 234.5, y: y - 6 }, { x: 234.5, y: y + 6 }, z, z > 0 ? '#a2a7a4' : '#78828a', 1.5);
		}
	}
};

const drawDeck = function (ctx: CanvasRenderingContext2D, view: View) {
	plate(ctx, view, deck, DECK_HEIGHT, '#515c65', '#90999e');
	// Large overlapping armor plates read at gameplay scale; fine seams stay subordinate.
	for (const side of [-1, 1]) {
		for (const [index, x] of [-182, -132, -82, -32, 18, 68, 118].entries()) {
			plate(ctx, view, [[x, side * 27], [x + 45, side * 27], [x + 45, side * 68], [x, side * 68]], DECK_HEIGHT + 0.3, armorColors[index % armorColors.length] ?? '#59636a');
			seam(ctx, view, { x: x + 3, y: side * 66 }, { x: x + 40, y: side * 66 }, DECK_HEIGHT + 0.5);
			for (const dx of [5, 33])
				plate(ctx, view, [[x + dx, side * 30], [x + dx + 3, side * 30], [x + dx + 3, side * 34], [x + dx, side * 34]], DECK_HEIGHT + 0.5, '#8b9295', '#424c54');
		}
		plate(ctx, view, [[169, side * 27], [219, side * 27], [219, side * 38], [207, side * 51], [169, side * 65]], DECK_HEIGHT + 0.3, '#626c73');
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
	// A broad, nearly flush foredeck replaces the pointed axial bow and trench.
	for (const side of [-1, 1]) {
		for (const x of [116, 168]) {
			plate(ctx, view, [[x, side * 2], [x + 46, side * 2], [x + 46, side * 24], [x, side * 24]], 23, '#667279', '#8e969a');
			seam(ctx, view, { x: x + 5, y: side * 20 }, { x: x + 40, y: side * 20 }, 23.5, '#394751', 1.2);
		}
	}
	for (const y of [-46, 46]) {
		block(ctx, view, -192, y, 28, 22, DECK_HEIGHT, 32, '#626e77');
		for (const x of [-200, -194, -188, -182]) seam(ctx, view, { x, y: y - 8 }, { x, y: y + 8 }, 33, '#293640', 1.5);
	}
	// Long, low aft terraces anchor the command bridge in the body of the ship.
	prism(ctx, view, center, [[-205, -25], [-12, -25], [8, -16], [8, 16], [-12, 25], [-205, 25]], 31, 37, '#637079', '#303e49', 0, '#87939b');
	prism(ctx, view, center, [[-198, -22], [-82, -22], [-63, -12], [-63, 12], [-82, 22], [-198, 22]], 37, 44, '#707b82', '#35434e', 0, '#919b9f');
	for (const x of [-59, -29]) block(ctx, view, x, 0, 20, 20, 37, 42, '#738088');
	const marking = toScreen({ x: 189, y: 0 }, view, 25);
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
	// The aft communications stack sits behind the nearer bridge wing.
	block(ctx, view, -196, 0, 20, 18, 44, 54, '#697780');
	block(ctx, view, -196, 0, 12, 12, 54, 68, '#7b878f');
	line(ctx, toScreen({ x: -196, y: 0 }, view, 68), toScreen({ x: -196, y: 0 }, view, 87), '#a3b0b6', Math.max(0.6, view.scale));
	// A wide sloped command block and overhanging bridge wings replace the tower.
	taperedTier(ctx, view, [[-197, -27], [-127, -27], [-127, 27], [-197, 27]], [[-181, -17], [-143, -17], [-143, 17], [-181, 17]], 44, 70);
	block(ctx, view, -162, 0, 62, 56, 70, 77, '#859097');
	taperedTier(ctx, view, [[-181, -17], [-144, -17], [-144, 17], [-181, 17]], [[-174, -12], [-151, -12], [-151, 12], [-174, 12]], 77, 88);
	block(ctx, view, -162, 0, 36, 34, 88, 92, '#89949a');
	for (const [z, x, width, y] of [[74, -162, 56, 28.5], [90, -162, 32, 17.5]] as const) {
		seam(ctx, view, { x: x - width / 2, y }, { x: x + width / 2, y }, z, '#202c35', 3);
		for (let dx = -width / 2 + 3; dx < width / 2; dx += 6)
			seam(ctx, view, { x: x + dx, y }, { x: x + dx + 2, y }, z, '#dfc591', 1.3);
	}
	for (const y of [-16, 16]) {
		line(ctx, toScreen({ x: -148, y: y * 0.6 }, view, 69), toScreen({ x: -132, y }, view, 44), '#9da6ab', Math.max(0.6, 2 * view.scale));
	}
	for (const [x, y, bottom, top] of [[-174, -7, 92, 111], [-162, 3, 92, 106], [-151, -5, 92, 102]] as const) {
		line(ctx, toScreen({ x, y }, view, bottom), toScreen({ x, y }, view, top), '#a3b0b6', Math.max(0.6, view.scale));
	}
	ctx.restore();
};
