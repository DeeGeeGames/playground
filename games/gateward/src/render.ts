import { ESCORTS, WEAPONS, type Enemy, type Escort, type Mount, type Point, type State } from './simulation';
import { drawBackdrop } from './backdrop';
import { journeyAt } from './journey';
import { drawArkBridge, drawArkHull } from './ark';
import { line, local, polygon, prism, type Outline } from './drawing';
import { DECK_HEIGHT, depth, edgeIndicator, FLIGHT_HEIGHT, mountHeight, toScreen, TURRET_HEIGHT, type View } from './projection';

interface DrawItem {
	point: Point;
	draw: () => void;
}

const drawInDepthOrder = function (items: DrawItem[]) {
	items.sort(function (a, b) { return depth(a.point) - depth(b.point); });
	for (const item of items)
		item.draw();
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
		ctx.fillStyle = '#303e48';
		ctx.beginPath();
		ctx.ellipse(base.x, base.y, rx, ry, 0, 0, Math.PI);
		ctx.lineTo(top.x - rx, top.y);
		ctx.ellipse(top.x, top.y, rx, ry, 0, Math.PI, 0, true);
		ctx.closePath();
		ctx.fill();
	}
	ctx.lineWidth = selected === index ? 2 : 1;
	ring(ctx, view, mount, 18, height, color, mount.weapon ? '#4c5962' : '#172731');
	if (mount.weapon) {
		// Rotating armored housings share the original aiming and selection centers.
		prism(ctx, view, mount, [[-13, -10], [7, -10], [13, -5], [13, 5], [7, 10], [-13, 10]], height, height + 7, '#77858e', '#3e4c58', mount.aim, '#9caab0');
		if (mount.weapon === 'missile') {
			for (const side of [-1, 1]) {
				const pod = local(mount, 0, side * 8, mount.aim);
				prism(ctx, view, pod, [[-11, -5], [14, -5], [14, 5], [-11, 5]], height + 5, height + 12, '#8c8575', '#4e5050', mount.aim, '#b6ac96');
				for (const across of [-2, 2])
					line(ctx, toScreen(local(pod, 14, across, mount.aim), view, height + 7), toScreen(local(pod, 14, across, mount.aim), view, height + 10), color, Math.max(0.8, 2 * view.scale));
			}
		}
		else {
			for (const across of mount.weapon === 'rail' ? [0] : [-5, 5]) {
				const barrel = local(mount, 0, across, mount.aim);
				const length = mount.weapon === 'rail' ? 35 : 27;
				prism(ctx, view, barrel, [[5, -2], [length, -2], [length, 2], [5, 2]], height + 4, height + 8, '#adb9bd', '#4d606c', mount.aim, '#b6c5c8');
				line(ctx, toScreen(local(barrel, length - 7, 0, mount.aim), view, height + 8), toScreen(local(barrel, length - 1, 0, mount.aim), view, height + 8), color, Math.max(1, 2 * view.scale));
			}
		}
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
	drawArkHull(ctx, view, state.time, reducedMotion);
	// Sort the aft superstructure with the hardpoints to preserve their visibility.
	const deck: DrawItem[] = state.mounts.map(function (mount, index) {
		return { point: mount, draw: function () { drawMount(ctx, view, mount, index, selected); } };
	});
	deck.push({ point: { x: -162, y: 0 }, draw: function () { drawArkBridge(ctx, view); } });
	drawInDepthOrder(deck);
	if (state.shield > 0) {
		ctx.lineWidth = 2;
		ring(ctx, view, center, 340, 30, '#88f1e4', '#88f1e408');
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
