import { ESCORTS, WEAPONS, type Enemy, type Escort, type Mount, type Point, type State } from './simulation';
import { drawBackdrop } from './backdrop';
import { journeyAt } from './journey';
import { DECK_HEIGHT, depth, edgeIndicator, FLIGHT_HEIGHT, mountHeight, toScreen, TURRET_HEIGHT, type View } from './projection';

type Outline = readonly (readonly [number, number])[];

const hull: Outline = [[-145, -32], [-125, -58], [85, -58], [155, -20], [168, 0], [155, 20], [85, 58], [-125, 58], [-145, 32]];

const spine: Outline = [[-115, -25], [79, -25], [135, 0], [79, 25], [-115, 25]];

const bridge: Outline = [[-20, -10], [15, -10], [23, 0], [15, 10], [-20, 10]];

interface DrawItem {
	point: Point;
	draw: () => void;
}

const drawInDepthOrder = function (items: DrawItem[]) {
	items.sort(function (a, b) { return depth(a.point) - depth(b.point); });
	for (const item of items)
		item.draw();
};

const polygon = function (ctx: CanvasRenderingContext2D, points: readonly Point[], fill: string, stroke?: string) {
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

const line = function (ctx: CanvasRenderingContext2D, a: Point, b: Point, color: string, width = 1) {
	ctx.beginPath();
	ctx.moveTo(a.x, a.y);
	ctx.lineTo(b.x, b.y);
	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.stroke();
};

const text = function (ctx: CanvasRenderingContext2D, value: string, at: Point, color: string, size = 10) {
	ctx.fillStyle = color;
	ctx.font = `${size}px ui-monospace, monospace`;
	ctx.textAlign = 'center';
	ctx.fillText(value, at.x, at.y);
};

const ring = function (ctx: CanvasRenderingContext2D, view: View, point: Point, radius: number, elevation: number, color: string, fill?: string) {
	const at = toScreen(point, view, elevation);
	ctx.beginPath();
	ctx.ellipse(at.x, at.y, radius * Math.sqrt(1.5) * view.scale, radius * Math.SQRT1_2 * view.scale, 0, 0, Math.PI * 2);
	if (fill) {
		ctx.fillStyle = fill;
		ctx.fill();
	}
	ctx.strokeStyle = color;
	ctx.stroke();
};

const local = function (point: Point, forward: number, across: number, angle: number): Point {
	return { x: point.x + Math.cos(angle) * forward - Math.sin(angle) * across, y: point.y + Math.sin(angle) * forward + Math.cos(angle) * across };
};

const prism = function (ctx: CanvasRenderingContext2D, view: View, origin: Point, shape: Outline, bottom: number, top: number, color: string, side: string, angle = 0, stroke = '#7693a6') {
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

const bar = function (ctx: CanvasRenderingContext2D, at: Point, width: number, ratio: number, color: string) {
	ctx.fillStyle = '#142332';
	ctx.fillRect(at.x - width / 2, at.y, width, 3);
	ctx.fillStyle = color;
	ctx.fillRect(at.x - width / 2, at.y, width * Math.max(0, ratio), 3);
};

const drawMount = function (ctx: CanvasRenderingContext2D, view: View, mount: Mount, index: number, selected: number) {
	const color = selected === index ? '#d6efad' : mount.weapon === 'rail' ? '#cdb6ef' : mount.weapon === 'missile' ? '#edc589' : '#91e3da';
	const height = mountHeight(mount);
	if (mount.weapon) {
		const base = toScreen(mount, view, DECK_HEIGHT);
		const top = toScreen(mount, view, TURRET_HEIGHT);
		const rx = 18 * Math.sqrt(1.5) * view.scale;
		const ry = 18 * Math.SQRT1_2 * view.scale;
		ctx.fillStyle = '#233d4d';
		ctx.beginPath();
		ctx.ellipse(base.x, base.y, rx, ry, 0, 0, Math.PI);
		ctx.lineTo(top.x - rx, top.y);
		ctx.ellipse(top.x, top.y, rx, ry, 0, Math.PI, 0, true);
		ctx.closePath();
		ctx.fill();
	}
	ctx.lineWidth = selected === index ? 2 : 1;
	ring(ctx, view, mount, 18, height, color, mount.weapon ? '#436675' : '#122333');
	if (mount.weapon) {
		prism(ctx, view, mount, [[-3, -4], [mount.weapon === 'rail' ? 34 : 25, -4], [mount.weapon === 'rail' ? 34 : 25, 4], [-3, 4]], height + 1, height + 7, color, '#4b6371', mount.aim, color);
		if (mount.weapon === 'missile')
			prism(ctx, view, local(mount, 0, -10, mount.aim), [[-4, -3], [22, -3], [22, 3], [-4, 3]], height + 1, height + 7, color, '#655544', mount.aim, color);
	}
	else
		text(ctx, '+', { ...toScreen(mount, view, height), y: toScreen(mount, view, height).y + 4 }, '#799eac', 13);
	const at = toScreen(mount, view, height);
	text(ctx, String(index + 1), { x: at.x, y: at.y + (mount.y < 0 ? -17 : 23) }, selected === index ? '#e1f3c1' : '#9ab7c5', view.width < 650 ? 10 : 11);
	if (mount.level > 0)
		for (let pip = 0; pip < mount.level; pip++) {
			ctx.fillStyle = color;
			ctx.fillRect(at.x - mount.level * 2.5 + pip * 5, at.y + 10, 3, 2);
		}
};

const drawArk = function (ctx: CanvasRenderingContext2D, view: View, state: State, selected: number, reducedMotion: boolean) {
	const center = { x: 0, y: 0 };
	const moving = journeyAt(state.time).speed > 0;
	const plume = moving ? 60 : 5;
	for (const y of [-22, 22]) {
		const flame: Outline = [[-144, y - 10], [-144, y + 10], [-144 - plume - (reducedMotion || !moving ? 0 : Math.sin(state.time * 17) * 5), y]];
		polygon(ctx, flame.map(function ([x, y]) { return toScreen({ x, y }, view, 6); }), '#79e6dd');
	}
	prism(ctx, view, center, hull, -15, DECK_HEIGHT, '#3e596a', '#1d3447', 0, '#93b0bf');
	prism(ctx, view, center, spine, DECK_HEIGHT, 29, '#273f54', '#172c3e', 0, '#56798c');
	for (const x of [-9, 20, 49, 78])
		line(ctx, toScreen({ x, y: -20 }, view, 30), toScreen({ x, y: 20 }, view, 30), '#49677c', view.scale);
	text(ctx, 'ARK / 07', toScreen({ x: 80, y: 0 }, view, 35), '#adc7d2', view.width < 650 ? 8 : 10);
	// A compact bridge leaves every hardpoint visible. Sort it with the turrets,
	// so aft hardware cannot paint over the bridge's nearer faces.
	const deck: DrawItem[] = state.mounts.map(function (mount, index) {
		return { point: mount, draw: function () { drawMount(ctx, view, mount, index, selected); } };
	});
	deck.push({ point: { x: -50, y: 0 }, draw: function () {
			prism(ctx, view, { x: -50, y: 0 }, bridge, 29, 39, '#57788c', '#28455c', 0, '#89a7b7');
			line(ctx, toScreen({ x: -66, y: 10 }, view, 36), toScreen({ x: -37, y: 10 }, view, 36), '#8be8e1', Math.max(1, 3 * view.scale));
		} });
	drawInDepthOrder(deck);
	if (state.shield > 0) {
		ctx.lineWidth = 2;
		ring(ctx, view, center, 179, 30, '#88f1e4', '#88f1e408');
	}
};

const drawEnemy = function (ctx: CanvasRenderingContext2D, view: View, enemy: Enemy) {
	const shape: Outline = enemy.kind === 'flagship' ? [[-46, -22], [-18, -35], [45, -15], [58, 0], [45, 15], [-18, 35], [-46, 22], [-22, 0]] : enemy.kind === 'armored' ? [[-22, -20], [17, -20], [30, 0], [17, 20], [-22, 20]] : enemy.kind === 'bomber' ? [[-18, -20], [0, -12], [22, 0], [0, 12], [-18, 20], [-9, 0]] : [[-13, -11], [18, 0], [-13, 11], [-5, 0]];
	const color = enemy.kind === 'armored' ? '#ad84a4' : enemy.kind === 'bomber' ? '#e5ac7c' : '#e08687';
	const angle = Math.atan2(-enemy.y, -enemy.x);
	prism(ctx, view, enemy, shape, enemy.kind === 'flagship' ? 9 : 22, FLIGHT_HEIGHT, color, '#513345', angle, '#f0baa8');
	if (enemy.kind === 'flagship')
		prism(ctx, view, enemy, [[-23, -12], [20, -12], [30, 0], [20, 12], [-23, 12]], FLIGHT_HEIGHT, 52, '#b793a2', '#513345', angle);
	if (enemy.hp < enemy.maxHp || enemy.kind === 'flagship') {
		const at = toScreen(enemy, view, enemy.kind === 'flagship' ? 80 : 62);
		bar(ctx, at, enemy.kind === 'flagship' ? 75 : 26, enemy.hp / enemy.maxHp, '#e78b82');
	}
};

const drawEscort = function (ctx: CanvasRenderingContext2D, view: View, escort: Escort) {
	const shape: Outline = escort.kind === 'guardian' ? [[-20, -13], [10, -13], [23, 0], [10, 13], [-20, 13], [-13, 0]] : [[-11, -8], [15, 0], [-11, 8], [-5, 0]];
	prism(ctx, view, escort, shape, 24, FLIGHT_HEIGHT, escort.kind === 'guardian' ? '#91bcec' : '#96e6e1', '#284a68', escort.angle, '#b8ebee');
	if (escort.hp < ESCORTS[escort.kind].hp)
		bar(ctx, toScreen(escort, view, 59), 26, escort.hp / ESCORTS[escort.kind].hp, '#89d5de');
};

const drawGate = function (ctx: CanvasRenderingContext2D, view: View, time: number) {
	const x = journeyAt(time).remaining;
	if (x > 1100) return;
	for (const radius of [170, 150]) {
		ctx.beginPath();
		for (let i = 0; i <= 64; i++) {
			const angle = i / 64 * Math.PI * 2;
			const at = toScreen({ x, y: Math.cos(angle) * radius }, view, Math.sin(angle) * radius + 25);
			if (i === 0)
				ctx.moveTo(at.x, at.y);
			else
				ctx.lineTo(at.x, at.y);
		}
		ctx.strokeStyle = radius === 170 ? '#25544e' : '#83dfcb';
		ctx.lineWidth = (radius === 170 ? 18 : 7) * view.scale;
		ctx.stroke();
	}
	text(ctx, 'KEPLER GATE', toScreen({ x, y: 0 }, view, 220), '#83dfcb');
};

export const render = function (ctx: CanvasRenderingContext2D, view: View, state: State, selected: number, reducedMotion: boolean, rallyMode: boolean) {
	const { width, height, scale } = view;
	if (width <= 0 || height <= 0)
		return;
	drawBackdrop(ctx, view, state.time, reducedMotion);
	ctx.save();
	for (const [value, point] of [['PORT', { x: 0, y: -330 }], ['STARBOARD', { x: 0, y: 330 }], ['BOW →', { x: 380, y: 0 }], ['← ASTERN', { x: -380, y: 0 }]] as const)
		text(ctx, value, toScreen(point, view), '#63818f', view.width < 650 ? 8 : 10);
	drawGate(ctx, view, state.time);
	const mount = state.mounts[selected];
	if (mount?.weapon) {
		ctx.lineWidth = 1;
		ctx.setLineDash([6, 8]);
		ring(ctx, view, mount, WEAPONS[mount.weapon].range * (1 + (mount.level - 1) * 0.12), TURRET_HEIGHT, '#84ead933', '#84ead907');
		ctx.setLineDash([]);
	}
	if (state.escorts.length > 0 || rallyMode) {
		ctx.lineWidth = 1.3;
		const color = rallyMode ? '#d5ed9b' : '#9edbf088';
		ring(ctx, view, state.rally, 25, 0, color);
		for (const axis of [0, 1])
			line(ctx, toScreen({ x: state.rally.x - (axis === 0 ? 35 : 0), y: state.rally.y - (axis === 1 ? 35 : 0) }, view), toScreen({ x: state.rally.x + (axis === 0 ? 35 : 0), y: state.rally.y + (axis === 1 ? 35 : 0) }, view), color);
		const at = toScreen(state.rally, view);
		text(ctx, 'RALLY', { x: at.x, y: at.y + 27 }, '#89bed2', 9);
	}
	// Canvas owns the draw queue; the plugin depth-sort systems operate on Pixi objects.
	const ships: DrawItem[] = [{ point: { x: 0, y: 0 }, draw: function () { drawArk(ctx, view, state, selected, reducedMotion); } }, ...state.enemies.map(function (enemy) { return { point: enemy, draw: function () { drawEnemy(ctx, view, enemy); } }; }), ...state.escorts.map(function (escort) { return { point: escort, draw: function () { drawEscort(ctx, view, escort); } }; })];
	drawInDepthOrder(ships);
	for (const shot of state.shots) {
		const color = shot.side === 'enemy' ? '#ff8d7f' : shot.weapon === 'rail' ? '#dbbeff' : shot.weapon === 'missile' ? '#f5ce8a' : '#99ece1';
		const tail = { x: shot.x - shot.vx * (shot.weapon === 'rail' ? 0.04 : 0.025), y: shot.y - shot.vy * (shot.weapon === 'rail' ? 0.04 : 0.025) };
		line(ctx, toScreen(tail, view, TURRET_HEIGHT), toScreen(shot, view, TURRET_HEIGHT), color, Math.max(1.2, (shot.weapon === 'rail' ? 3 : 2) * scale));
	}
	for (const e of state.effects) {
		ctx.globalAlpha = e.life / e.maxLife;
		ctx.lineWidth = 2;
		ring(ctx, view, e, e.radius * (1 - e.life / e.maxLife * 0.7), TURRET_HEIGHT, e.color);
	}
	ctx.globalAlpha = 1;
	for (const enemy of state.enemies) {
		if (enemy.id === state.priority) {
			ctx.setLineDash([5, 4]);
			ctx.lineWidth = 1.5;
			ring(ctx, view, enemy, enemy.kind === 'flagship' ? 70 : 42, FLIGHT_HEIGHT, '#f4d68a');
			ctx.setLineDash([]);
		}
		const marker = edgeIndicator(enemy, view);
		if (!marker)
			continue;
		ctx.save();
		ctx.translate(marker.point.x, marker.point.y);
		ctx.rotate(marker.angle);
		polygon(ctx, [{ x: 8, y: 0 }, { x: -6, y: -5 }, { x: -6, y: 5 }], '#f59682');
		ctx.restore();
	}
	ctx.restore();
};
