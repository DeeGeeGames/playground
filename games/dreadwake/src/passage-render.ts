import { PASSAGE, RELAY_RANGE, YARD_RANGE, type PassageView } from './passage-layout';
import { project, worldToScreen, type Camera } from './projection';
import { line, polygon } from './ship-art';
import type { Point, State } from './simulation';
import { clearLabelPosition, projectBearing, type LabelObstacle } from './tactical-labels';
import { CEL } from './visual-theme';

const mainLane = [PASSAGE.origin, PASSAGE.fork, PASSAGE.yard];
const outerLane = [PASSAGE.fork, PASSAGE.outer, PASSAGE.yard];
const routePoints = [...mainLane, PASSAGE.outer, PASSAGE.relay, PASSAGE.picket].map(function (point) { return project(point); });
const minX = Math.min(...routePoints.map(function (point) { return point.x; }));
const maxX = Math.max(...routePoints.map(function (point) { return point.x; }));
const minY = Math.min(...routePoints.map(function (point) { return point.y; }));
const maxY = Math.max(...routePoints.map(function (point) { return point.y; }));
const tenderInk = CEL.cream;
const outerInk = CEL.violet;
const font = 'Consolas, "Liberation Mono", monospace';

const trace = function (ctx: CanvasRenderingContext2D, points: readonly Point[], locate: (point: Point) => Point, stroke: string, width: number, dash: number[] = []) {
	ctx.beginPath();
	points.forEach(function (point, index) {
		const { x, y } = locate(point);
		if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
	});
	ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
};

const projector = function (at: Point, angle: number, view: Camera) {
	const cos = Math.cos(angle); const sin = Math.sin(angle);
	return function (forward: number, across: number, elevation = 0) {
		return worldToScreen({ x: at.x + cos * forward - sin * across, y: at.y + sin * forward + cos * across }, view, elevation);
	};
};

const drawTender = function (ctx: CanvasRenderingContext2D, view: Camera, tender: PassageView['tender']) {
	const at = projector(tender, tender.angle, view);
	const hull = [[45, -13], [45, 13], [22, 32], [-36, 32], [-44, 23], [-44, -23], [-36, -32], [22, -32]] as const;
	const outline = function (height: number) { return hull.map(function ([f, a]) { return at(f, a, height); }); };
	polygon(ctx, outline(4), CEL.dark, CEL.ink);
	polygon(ctx, outline(14), '#abc9b1', CEL.ink);
	for (const side of [-1, 1]) {
		polygon(ctx, [at(-42, side * 20, 18), at(19, side * 20, 18), at(24, side * 30, 18), at(-41, side * 30, 18)], '#638b85', CEL.ink);
		line(ctx, at(-40, side * 26, 15), at(-49, side * 26, 15), CEL.mint, 2);
	}
	polygon(ctx, [at(-27, -15, 18), at(2, -15, 18), at(2, 15, 18), at(-27, 15, 18)], '#29695f', CEL.ink);
	const width = Math.max(1.4, 3.5 * view.scale);
	line(ctx, at(-23, 0, 19), at(-3, 0, 19), tenderInk, width);
	line(ctx, at(-13, -10, 19), at(-13, 10, 19), tenderInk, width);
	polygon(ctx, [at(5, -12, 20), at(29, -10, 20), at(36, 0, 20), at(29, 10, 20), at(5, 12, 20)], '#376371', CEL.ink);
};

const drawRelay = function (ctx: CanvasRenderingContext2D, view: Camera, color: string) {
	const at = projector(PASSAGE.relay, 0, view);
	polygon(ctx, [at(38, 0, 4), at(0, 29, 4), at(-38, 0, 4), at(0, -29, 4)], CEL.dark, CEL.ink);
	polygon(ctx, [at(30, 0, 12), at(0, 22, 12), at(-30, 0, 12), at(0, -22, 12)], CEL.side, CEL.ink);
	line(ctx, at(0, 0, 10), at(0, 0, 68), CEL.ink, Math.max(3, 10 * view.scale));
	line(ctx, at(0, 0, 18), at(0, 0, 65), CEL.side, Math.max(1.4, 5 * view.scale));
	polygon(ctx, [at(-36, 0, 67), at(-21, 0, 51), at(16, 0, 52), at(34, 0, 75), at(11, 0, 68), at(-12, 0, 64)], CEL.top, CEL.ink);
	line(ctx, at(0, 0, 61), at(15, 0, 83), color, 1.5);
	const light = at(15, 0, 83);
	ctx.fillStyle = color; ctx.fillRect(light.x - 2, light.y - 2, 4, 4);
};

const drawYard = function (ctx: CanvasRenderingContext2D, view: Camera, color: string) {
	const at = projector(PASSAGE.yard, Math.atan2(PASSAGE.yard.y - PASSAGE.fork.y, PASSAGE.yard.x - PASSAGE.fork.x), view);
	polygon(ctx, [at(36, -62, 6), at(67, -51, 6), at(67, 51, 6), at(36, 62, 6)], CEL.dark, CEL.ink);
	polygon(ctx, [at(36, -62, 21), at(67, -51, 21), at(67, 51, 21), at(36, 62, 21)], CEL.side, CEL.ink);
	for (const side of [-1, 1]) {
		polygon(ctx, [at(-71, side * 38, 4), at(39, side * 38, 4), at(39, side * 66, 4), at(-56, side * 66, 4)], CEL.dark, CEL.ink);
		polygon(ctx, [at(-71, side * 38, 18), at(39, side * 38, 18), at(39, side * 66, 18), at(-56, side * 66, 18)], CEL.side, CEL.ink);
		line(ctx, at(-64, side * 40, 18), at(30, side * 40, 18), color, 1.5);
		for (const f of [-49, -26, -3, 20]) line(ctx, at(f, side * 47, 19), at(f + 10, side * 56, 19), CEL.ink, 1.5);
	}
};

const relayColor = function (passage: PassageView) { return passage.relayOnline ? CEL.mint : CEL.amber; };
const yardColor = function (passage: PassageView) { return passage.yardOpen ? CEL.mint : CEL.amber; };

const drawApproach = function (ctx: CanvasRenderingContext2D, view: Camera, target: Point, range: number, color: string) {
	const at = worldToScreen(target, view);
	ctx.beginPath();
	ctx.ellipse(at.x, at.y, range * view.scale * Math.sqrt(1.5), range * view.scale * Math.SQRT1_2, 0, 0, Math.PI * 2);
	ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([3, 6]); ctx.stroke(); ctx.setLineDash([]);
};

export const drawPassageGeography = function (ctx: CanvasRenderingContext2D, view: Camera, state: State, passage: PassageView, aboveShips = false) {
	const locate = function (point: Point) { return worldToScreen(point, view); };
	ctx.save();
	if (aboveShips) {
		// The WebGL annotation is above the meshes. Leave a cutout around
		// each hull so lane marks and dock structures cannot paint over it.
		for (const ship of [state.player, ...state.enemies]) {
			const at = worldToScreen(ship, view, 22);
			const tip = worldToScreen({ x: ship.x + Math.cos(ship.angle), y: ship.y + Math.sin(ship.angle) }, view, 22);
			const heading = Math.atan2(tip.y - at.y, tip.x - at.x);
			const radius = ship.length * view.scale * 0.64;
			ctx.beginPath(); ctx.rect(0, 0, view.width, view.height);
			ctx.moveTo(at.x + Math.cos(heading) * radius, at.y + Math.sin(heading) * radius);
			ctx.ellipse(at.x, at.y, radius, ship.width * view.scale * 0.66, heading, 0, Math.PI * 2);
			ctx.clip('evenodd');
		}
	}
	trace(ctx, mainLane, locate, `${CEL.mint}${passage.route === 'outer' ? '34' : '53'}`, 1.2);
	trace(ctx, outerLane, locate, `${outerInk}${passage.route === 'outer' ? '77' : '4f'}`, 1.3, [6, 8]);
	if ((passage.route === 'inbound' || passage.route === 'returning') && !passage.relayOnline) drawApproach(ctx, view, PASSAGE.relay, RELAY_RANGE, `${CEL.amber}55`);
	if (passage.yardOpen) drawApproach(ctx, view, PASSAGE.yard, YARD_RANGE, `${CEL.mint}65`);
	for (const waypoint of [PASSAGE.origin, PASSAGE.fork, PASSAGE.outer]) {
		const { x, y } = locate(waypoint);
		polygon(ctx, [{ x, y: y - 4 }, { x: x + 6, y }, { x, y: y + 4 }, { x: x - 6, y }], CEL.ink, waypoint === PASSAGE.outer ? outerInk : CEL.muted, 1);
	}
	drawRelay(ctx, view, relayColor(passage));
	drawYard(ctx, view, yardColor(passage));
	drawTender(ctx, view, passage.tender);
	ctx.restore();
};

export const passageChartBounds = function (view: Camera, hud: readonly LabelObstacle[], radar?: LabelObstacle): LabelObstacle | undefined {
	const { width, height } = view;
	const helm = { left: width / 2 - 69, right: width / 2 + 69, top: height * 0.45 - 53, bottom: height * 0.45 + 43 };
	const obstacles = [...hud, helm];
	if (radar) obstacles.push(radar);
	const sizes = width < 600 ? [[192, 107], [178, 90]] as const : [[234, 128], [192, 107], [178, 90]] as const;
	for (const [w, h] of sizes) {
		const xs = [width - w / 2 - 15, w / 2 + 15, width / 2];
		const ys = [height * 0.32, height * 0.67, height * 0.47];
		for (const y of ys) for (const x of xs) {
			const at = clearLabelPosition({ x, y }, w + 8, h + 8, obstacles, width, height);
			if (at) return { left: at.x - w / 2, right: at.x + w / 2, top: at.y - h / 2, bottom: at.y + h / 2 };
		}
	}
	return undefined;
};

type ChartSymbol = 'ship' | 'picket' | 'tender' | 'fork' | 'relay' | 'yard';

const symbol = function (ctx: CanvasRenderingContext2D, at: Point, kind: ChartSymbol, color: string, bearing = -Math.PI / 2, size = 5) {
	const { x, y } = at;
	const s = size;
	ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 1.4;
	switch (kind) {
		case 'ship':
			polygon(ctx, [0, 2.4, Math.PI, -2.4].map(function (offset, i) {
				const length = i === 0 ? s + 1 : i === 2 ? s * 0.4 : s;
				return { x: x + Math.cos(bearing + offset) * length, y: y + Math.sin(bearing + offset) * length };
			}), color, CEL.ink, 1);
			break;
		case 'picket':
			line(ctx, { x: x - s, y: y - s }, { x: x + s, y: y + s }, color, 1.5);
			line(ctx, { x: x + s, y: y - s }, { x: x - s, y: y + s }, color, 1.5);
			break;
		case 'tender':
			ctx.fillRect(x - 1, y - s, 2, s * 2); ctx.fillRect(x - s, y - 1, s * 2, 2);
			break;
		case 'fork':
			polygon(ctx, [{ x, y: y - s }, { x: x + s, y }, { x, y: y + s }, { x: x - s, y }], CEL.ink, color, 1.4);
			break;
		case 'relay':
			ctx.beginPath(); ctx.arc(x, y, s - 1, 0, Math.PI * 2); ctx.fillStyle = CEL.ink; ctx.fill(); ctx.stroke();
			ctx.fillStyle = color; ctx.fillRect(x - 1, y - 1, 2, 2);
			break;
		case 'yard':
			ctx.fillStyle = CEL.ink; ctx.fillRect(x - s, y - s, s * 2, s * 2); ctx.strokeRect(x - s, y - s, s * 2, s * 2);
			break;
	}
};

export const drawPassageChart = function (ctx: CanvasRenderingContext2D, box: LabelObstacle, state: State, passage: PassageView) {
	const { left, right, top, bottom } = box;
	const width = right - left;
	const mapTop = top + 23; const mapBottom = bottom - 28;
	const center = { x: (left + right) / 2, y: (mapTop + mapBottom) / 2 };
	const scale = Math.min((width - 25) / Math.max(1, maxX - minX), (mapBottom - mapTop - 10) / Math.max(1, maxY - minY));
	const locate = function (point: Point) {
		const at = project(point);
		return { x: Math.max(left + 8, Math.min(right - 8, center.x + (at.x - (minX + maxX) / 2) * scale)),
			y: Math.max(mapTop + 3, Math.min(mapBottom - 4, center.y + (at.y - (minY + maxY) / 2) * scale)) };
	};
	const enemy = state.enemies[0];
	const contacts = [
		{ kind: 'ship', name: 'YOU', color: CEL.mint, point: state.player },
		{ kind: 'picket', name: 'PICKET', color: enemy ? CEL.hostile : CEL.side, point: enemy ?? PASSAGE.picket },
		{ kind: 'tender', name: 'TENDER', color: tenderInk, point: passage.tender },
		{ kind: 'fork', name: 'FORK', color: CEL.muted, point: PASSAGE.fork },
		{ kind: 'relay', name: 'RELAY', color: relayColor(passage), point: PASSAGE.relay },
		{ kind: 'yard', name: 'YARD', color: yardColor(passage), point: PASSAGE.yard },
	] as const;

	ctx.save();
	ctx.fillStyle = '#102531f0'; ctx.fillRect(left, top, width, bottom - top);
	ctx.strokeStyle = '#52757c'; ctx.lineWidth = 1; ctx.strokeRect(left + 0.5, top + 0.5, width - 1, bottom - top - 1);
	ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = `700 10px ${font}`;
	ctx.fillStyle = CEL.top; ctx.fillText('CHART', left + 9, top + 12);
	line(ctx, { x: left + 49, y: top + 12 }, { x: left + 60, y: top + 12 }, CEL.mint, 1.3);
	ctx.fillStyle = CEL.muted; ctx.fillText('MAIN', left + 64, top + 12);
	ctx.setLineDash([3, 2]); line(ctx, { x: left + 94, y: top + 12 }, { x: left + 107, y: top + 12 }, outerInk, 1.5); ctx.setLineDash([]);
	ctx.fillText('OUTER', left + 111, top + 12);
	for (const y of [mapTop - 3, mapBottom + 2]) line(ctx, { x: left + 6, y }, { x: right - 6, y }, '#36535e');

	trace(ctx, mainLane, locate, `${CEL.mint}${passage.route === 'outer' ? '75' : 'd0'}`, 1.4);
	trace(ctx, outerLane, locate, `${outerInk}${passage.route === 'outer' ? 'ee' : 'a0'}`, 1.4, [4, 3]);
	const start = locate(PASSAGE.origin);
	ctx.fillStyle = CEL.muted; ctx.fillRect(start.x - 2, start.y - 2, 4, 4);
	const p = state.player;
	const bow = project({ x: Math.cos(p.angle), y: Math.sin(p.angle) });
	const heading = Math.atan2(bow.y, bow.x);
	for (const contact of [...contacts.slice(1), contacts[0]]) {
		symbol(ctx, locate(contact.point), contact.kind, contact.color, heading);
	}
	contacts.forEach(function (contact, index) {
		const x = left + 13 + index % 3 * ((width - 13) / 3);
		const y = mapBottom + 10 + Math.floor(index / 3) * 11;
		symbol(ctx, { x, y }, contact.kind, contact.color, -Math.PI / 2, 3.7);
		ctx.fillStyle = CEL.top; ctx.fillText(contact.name, x + 9, y);
	});
	ctx.restore();
};

export const drawPassageBearings = function (ctx: CanvasRenderingContext2D, view: Camera, state: State, passage: PassageView, obstacles: readonly LabelObstacle[]) {
	const origin = worldToScreen(state.player, view, 20);
	const occupied = [...obstacles];
	const approachingOuter = passage.route === 'outer' && project(passage.tender).x < project(PASSAGE.outer).x;
	const markers = [
		{ text: 'YARD', point: PASSAGE.yard, height: 45, color: yardColor(passage), edge: passage.yardOpen || passage.route === 'direct' || (passage.route === 'outer' && !approachingOuter) },
		{ text: 'RELAY', point: PASSAGE.relay, height: 99, color: relayColor(passage), edge: !passage.relayOnline && (passage.route === 'inbound' || passage.route === 'returning') },
		{ text: 'TENDER', point: passage.tender, height: 44, color: tenderInk, edge: passage.route === 'returning' },
		{ text: 'FORK', point: PASSAGE.fork, height: 0, color: CEL.muted, edge: passage.route === 'inbound' },
		{ text: 'OUTER', point: PASSAGE.outer, height: 0, color: outerInk, edge: approachingOuter },
		{ text: 'GATE', point: PASSAGE.origin, height: 0, color: CEL.muted, edge: passage.route === 'returning' },
	];

	ctx.save();
	ctx.font = `700 10px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
	for (const marker of markers) {
		const target = worldToScreen(marker.point, view, marker.height);
		const bearing = projectBearing(origin, target, view.width, view.height, occupied);
		if (!bearing || (!bearing.visible && !marker.edge)) continue;
		const { x, y } = bearing.point;
		if (!bearing.visible) {
			const angle = Math.atan2(target.y - origin.y, target.x - origin.x);
			polygon(ctx, [0, 2.4, -2.4].map(function (offset) {
				return { x: x + Math.cos(angle + offset) * 6, y: y + Math.sin(angle + offset) * 6 };
			}), marker.color, CEL.ink, 1);
		}
		const width = ctx.measureText(marker.text).width + 10;
		const at = clearLabelPosition({ x, y: y + (marker.height > 0 && bearing.visible ? -11 : 13) }, width, 15, occupied, view.width, view.height);
		if (!at) continue;
		occupied.push({ left: at.x - width / 2 - 3, right: at.x + width / 2 + 3, top: at.y - 9, bottom: at.y + 9 });
		ctx.fillStyle = '#112431dc'; ctx.fillRect(at.x - width / 2, at.y - 7, width, 14);
		ctx.fillStyle = marker.color; ctx.fillText(marker.text, at.x, at.y);
	}
	ctx.restore();
};
