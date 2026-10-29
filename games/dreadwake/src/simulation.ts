export interface Point { x: number; y: number }
export type Side = 'port' | 'starboard';
export type CombatEvent = 'cannon' | 'hit' | 'damage' | 'explosion' | 'wave' | 'shield' | 'shield-hit' | 'alert' | 'ready';
export interface Ship extends Point {
	id: number; angle: number; vx: number; vy: number; hp: number; maxHp: number;
	length: number; width: number;
}
export interface Enemy extends Ship {
	kind: 'frigate' | 'cruiser'; cooldown: number; warning: number; aim: Point; orbit: number;
}
export interface Battery { reload: number; remaining: number; next: number; target: number | undefined }
export interface Shell extends Point { vx: number; vy: number; life: number; hostile: boolean; damage: number }
export interface Effect extends Point { kind: 'muzzle' | 'impact' | 'explosion' | 'shield'; life: number; duration: number }
export interface Wreck extends Point { angle: number; length: number; width: number; life: number }
export interface State {
	player: Ship & { throttle: number; yaw: number; braced: boolean };
	batteries: Record<Side, Battery>; enemies: Enemy[]; shells: Shell[]; effects: Effect[]; wrecks: Wreck[];
	time: number; wave: number; intermission: number; kills: number; nextId: number;
	outcome: 'playing' | 'won' | 'lost'; events: CombatEvent[]; shake: number;
	stats: { salvos: number; hits: number; damageBlocked: number };
	shield: { active: number; cooldown: number; held: boolean };
	priorityTarget: number | undefined;
}
export interface Controls { drive: number; turn: number; neutral: boolean; port: boolean; starboard: boolean; brace: boolean; pulse: boolean }
export const RANGE = 690;
export const ARC = Math.PI / 6;
export const RELOAD = 7.5;
export const MAX_HULL = 1400;
export const SHIELD_DURATION = 3;
export const SHIELD_COOLDOWN = 18;
export const clamp = function (value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); };
export const distance = function (a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); };
export const angleDelta = function (from: number, to: number) { return Math.atan2(Math.sin(to - from), Math.cos(to - from)); };
export const sideAngle = function (ship: Ship, side: Side) { return ship.angle + (side === 'port' ? -1 : 1) * Math.PI / 2; };
export const localPoint = function (ship: Ship, forward: number, across: number): Point {
	return { x: ship.x + Math.cos(ship.angle) * forward - Math.sin(ship.angle) * across, y: ship.y + Math.sin(ship.angle) * forward + Math.cos(ship.angle) * across };
};
export const inArc = function (ship: Ship, target: Point, side: Side) {
	return distance(ship, target) <= RANGE && Math.abs(angleDelta(sideAngle(ship, side), Math.atan2(target.y - ship.y, target.x - ship.x))) <= ARC;
};
export const targetFor = function (state: State, side: Side): Enemy | undefined {
	const priority = state.enemies.find(function (enemy) { return enemy.id === state.priorityTarget && enemy.hp > 0 && inArc(state.player, enemy, side); });
	if (priority) return priority;
	return state.enemies.filter(function (enemy) { return enemy.hp > 0 && inArc(state.player, enemy, side); })
		.sort(function (a, b) { return distance(state.player, a) - distance(state.player, b) || a.id - b.id; })[0];
};
export const designateTarget = function (state: State, id: number | undefined) {
	state.priorityTarget = state.enemies.find(function (enemy) { return enemy.hp > 0 && enemy.id === id; })?.id;
};
export const cycleTarget = function (state: State) {
	const targets = [...state.enemies].filter(function (enemy) { return enemy.hp > 0; }).sort(function (a, b) { return a.id - b.id; });
	const current = targets.findIndex(function (enemy) { return enemy.id === state.priorityTarget; });
	designateTarget(state, targets[current + 1]?.id);
};
const approach = function (value: number, target: number, amount: number) { return value + clamp(target - value, -amount, amount); };
const effect = function (state: State, at: Point, kind: Effect['kind']) {
	const duration = kind === 'explosion' ? 1.8 : kind === 'impact' ? 0.65 : 0.32;
	state.effects.push({ ...at, kind, life: duration, duration });
};
const spawnWave = function (state: State) {
	const p = state.player;
	const bearings = state.wave === 1 ? [-1.55, 1.45] : state.wave === 2 ? [-1.9, 0.9, 2.1] : [-1.4, 1.5, 3];
	for (const [index, bearing] of bearings.entries()) {
		const angle = p.angle + bearing;
		const radius = 460 + index * 70;
		const kind = state.wave === 3 && index === 2 ? 'cruiser' : 'frigate';
		const hp = kind === 'cruiser' ? 600 : 280;
		const x = p.x + Math.cos(angle) * radius; const y = p.y + Math.sin(angle) * radius;
		state.enemies.push({ id: state.nextId++, x, y, angle: angle + Math.PI / 2, vx: 0, vy: 0,
			hp, maxHp: hp, kind, length: kind === 'cruiser' ? 170 : 115, width: kind === 'cruiser' ? 58 : 42,
			cooldown: 5 + index * 2, warning: 0, aim: { x: p.x, y: p.y }, orbit: index % 2 === 0 ? 1 : -1 });
	}
	state.events.push('wave');
};
export const createState = function (): State {
	const state: State = {
		player: { id: 0, x: 0, y: 0, angle: -Math.PI / 2, vx: 0, vy: 0, hp: MAX_HULL, maxHp: MAX_HULL,
			length: 220, width: 90, throttle: 0, yaw: 0, braced: false },
		batteries: { port: { reload: 0, remaining: 0, next: 0, target: undefined }, starboard: { reload: 0, remaining: 0, next: 0, target: undefined } },
		enemies: [], shells: [], effects: [], wrecks: [], time: 0, wave: 1, intermission: 0, kills: 0, nextId: 1,
		outcome: 'playing', events: [], shake: 0, stats: { salvos: 0, hits: 0, damageBlocked: 0 },
		shield: { active: 0, cooldown: 0, held: false }, priorityTarget: undefined,
	};
	spawnWave(state); state.events = [];
	return state;
};

// Sweep against the ship's oriented ellipse; resolve the nearest hull first.
export const hitFraction = function (from: Point, to: Point, ship: Ship): number | undefined {
	const transform = function (point: Point) {
		const dx = point.x - ship.x; const dy = point.y - ship.y;
		return { x: (dx * Math.cos(ship.angle) + dy * Math.sin(ship.angle)) / (ship.length / 2 + 3),
			y: (-dx * Math.sin(ship.angle) + dy * Math.cos(ship.angle)) / (ship.width / 2 + 3) };
	};
	const a = transform(from); const b = transform(to);
	const dx = b.x - a.x; const dy = b.y - a.y; const c = a.x * a.x + a.y * a.y - 1;
	if (c <= 0) return 0;
	const length = dx * dx + dy * dy;
	if (length === 0) return undefined;
	const dot = a.x * dx + a.y * dy; const discriminant = dot * dot - length * c;
	if (discriminant < 0) return undefined;
	const entry = (-dot - Math.sqrt(discriminant)) / length;
	return entry >= 0 && entry <= 1 ? entry : undefined;
};
const fireGun = function (state: State, side: Side, battery: Battery) {
	const p = state.player; const direction = sideAngle(p, side);
	const index = 6 - battery.remaining;
	const muzzle = localPoint(p, 64 - index * 25, (side === 'port' ? -1 : 1) * p.width * 0.5);
	const target = state.enemies.find(function (enemy) { return enemy.id === battery.target && enemy.hp > 0; });
	const flight = target ? distance(muzzle, target) / 460 : 0;
	const aim = target ? { x: target.x + target.vx * flight, y: target.y + target.vy * flight } : undefined;
	const angle = aim ? direction + clamp(angleDelta(direction, Math.atan2(aim.y - muzzle.y, aim.x - muzzle.x)), -ARC, ARC) : direction;
	state.shells.push({ ...muzzle, vx: Math.cos(angle) * 460, vy: Math.sin(angle) * 460, hostile: false, damage: 58, life: RANGE / 460 });
	p.vx -= Math.cos(angle) * 1.8; p.vy -= Math.sin(angle) * 1.8;
	battery.remaining--; battery.next += 0.14;
	effect(state, muzzle, 'muzzle'); state.events.push('cannon'); state.shake = Math.max(state.shake, 3);
};
const updateBattery = function (state: State, side: Side, fire: boolean, dt: number) {
	const battery = state.batteries[side]; const p = state.player;
	battery.reload = Math.max(0, battery.reload - dt * (p.braced ? 0.45 : 1));
	if (fire && !p.braced && battery.reload === 0 && battery.remaining === 0) {
		battery.target = targetFor(state, side)?.id;
		battery.remaining = 6; battery.next = 0; battery.reload = RELOAD; state.stats.salvos++;
	}
	if (battery.remaining > 0) {
		battery.next -= dt;
		if (battery.next <= 0) fireGun(state, side, battery);
	}
};
const updateEnemy = function (state: State, enemy: Enemy, dt: number) {
	const p = state.player; const range = distance(enemy, p);
	const bearing = Math.atan2(p.y - enemy.y, p.x - enemy.x);
	const desired = bearing + enemy.orbit * (range > 680 ? 0.3 : range < 330 ? 2.2 : 1.4);
	enemy.angle += clamp(angleDelta(enemy.angle, desired), -dt * 0.42, dt * 0.42);
	const speed = enemy.kind === 'cruiser' ? 30 : 48;
	enemy.vx = Math.cos(enemy.angle) * speed; enemy.vy = Math.sin(enemy.angle) * speed;
	enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
	if (enemy.warning > 0) {
		enemy.warning -= dt;
		if (enemy.warning <= 0) {
			const angle = Math.atan2(enemy.aim.y - enemy.y, enemy.aim.x - enemy.x);
			const count = enemy.kind === 'cruiser' ? 7 : 5;
			for (let i = 0; i < count; i++) {
				const spread = angle + (i - (count - 1) / 2) * 0.032;
				state.shells.push({ x: enemy.x, y: enemy.y, vx: Math.cos(spread) * 240, vy: Math.sin(spread) * 240, life: 4.2, hostile: true, damage: enemy.kind === 'cruiser' ? 38 : 26 });
			}
			effect(state, enemy, 'muzzle'); enemy.cooldown = enemy.kind === 'cruiser' ? 8 : 10;
		}
	} else {
		enemy.cooldown -= dt;
		if (enemy.cooldown <= 0 && range < 900) {
			enemy.warning = 1.8;
			state.events.push('alert');
			// Commit the firing solution at the start of the tell. A course change can dodge it.
			const lead = range / 240 + 1.8;
			enemy.aim = { x: p.x + p.vx * lead, y: p.y + p.vy * lead };
		}
	}
	// Hulls push apart at close quarters; ramming is slow and costly.
	const separation = distance(enemy, p); const minimum = (p.length + enemy.length) * 0.28;
	if (separation < minimum) {
		const away = separation > 0 ? Math.atan2(enemy.y - p.y, enemy.x - p.x) : enemy.angle;
		const push = (minimum - separation) * Math.min(1, dt * 3);
		enemy.x += Math.cos(away) * push; enemy.y += Math.sin(away) * push;
		p.vx -= Math.cos(away) * dt * 8; p.vy -= Math.sin(away) * dt * 8;
		enemy.hp -= dt * 45;
		const damage = dt * 14; const received = damage * (state.shield.active > 0 ? 0.15 : p.braced ? 0.35 : 1);
		p.hp -= received; state.stats.damageBlocked += damage - received;
	}
};
export const step = function (state: State, input: Controls, elapsed: number) {
	state.events = [];
	if (state.outcome !== 'playing' || !Number.isFinite(elapsed) || elapsed <= 0) return;
	const dt = Math.min(elapsed, 1 / 30); const p = state.player;
	state.time += dt; state.shake = Math.max(0, state.shake - dt * 12);
	const cooling = state.shield.cooldown > 0;
	state.shield.active = Math.max(0, state.shield.active - dt);
	state.shield.cooldown = Math.max(0, state.shield.cooldown - dt);
	if (cooling && state.shield.cooldown === 0) state.events.push('ready');
	if (input.pulse && !state.shield.held && state.shield.cooldown === 0) {
		state.shield.active = SHIELD_DURATION; state.shield.cooldown = SHIELD_COOLDOWN; state.events.push('shield');
	}
	state.shield.held = input.pulse;
	p.braced = input.brace;
	p.throttle = input.neutral ? 0 : clamp(p.throttle + input.drive * dt * 0.45, -0.35, 1);
	p.yaw = approach(p.yaw, input.turn * (p.braced ? 0.09 : 0.24), dt * 0.12);
	p.angle = angleDelta(0, p.angle + p.yaw * dt);
	const speed = p.throttle * (p.braced ? 24 : 86);
	p.vx += (Math.cos(p.angle) * speed - p.vx) * dt * 0.22;
	p.vy += (Math.sin(p.angle) * speed - p.vy) * dt * 0.22;
	p.x += p.vx * dt; p.y += p.vy * dt;
	updateBattery(state, 'port', input.port, dt); updateBattery(state, 'starboard', input.starboard, dt);
	for (const enemy of state.enemies) if (enemy.hp > 0) updateEnemy(state, enemy, dt);
	for (const shell of state.shells) {
		const from = { x: shell.x, y: shell.y }; const travel = Math.min(dt, shell.life);
		shell.x += shell.vx * travel; shell.y += shell.vy * travel; shell.life -= dt;
		const targets: Ship[] = shell.hostile ? [p] : state.enemies;
		const hit = targets.filter(function (ship) { return ship.hp > 0; }).map(function (ship) { return { ship, fraction: hitFraction(from, shell, ship) }; })
			.filter(function (candidate): candidate is { ship: Ship; fraction: number } { return candidate.fraction !== undefined; })
			.sort(function (a, b) { return a.fraction - b.fraction || a.ship.id - b.ship.id; })[0];
		if (hit) {
			const shielded = shell.hostile && state.shield.active > 0;
			const damage = shell.damage * (shielded ? 0.15 : shell.hostile && p.braced ? 0.35 : 1);
			hit.ship.hp = Math.max(0, hit.ship.hp - damage); shell.life = 0;
			effect(state, { x: from.x + (shell.x - from.x) * hit.fraction, y: from.y + (shell.y - from.y) * hit.fraction }, shielded ? 'shield' : 'impact');
			state.events.push(shielded ? 'shield-hit' : shell.hostile ? 'damage' : 'hit'); state.shake = Math.max(state.shake, shell.hostile ? shielded ? 1 : 5 : 2);
			if (shell.hostile) state.stats.damageBlocked += shell.damage - damage;
			else state.stats.hits++;
		}
	}
	state.shells = state.shells.filter(function (shell) { return shell.life > 0; });
	for (const enemy of state.enemies) if (enemy.hp <= 0) {
		state.kills++; effect(state, enemy, 'explosion'); state.events.push('explosion'); state.shake = 7;
		state.wrecks.push({ x: enemy.x, y: enemy.y, angle: enemy.angle, length: enemy.length, width: enemy.width, life: 35 });
	}
	state.enemies = state.enemies.filter(function (enemy) { return enemy.hp > 0; });
	if (!state.enemies.some(function (enemy) { return enemy.id === state.priorityTarget; })) state.priorityTarget = undefined;
	state.effects = state.effects.filter(function (fx) { fx.life -= dt; return fx.life > 0; });
	state.wrecks = state.wrecks.filter(function (wreck) { wreck.life -= dt; return wreck.life > 0; });
	p.hp = Math.max(0, p.hp);
	if (p.hp <= 0) {
		state.outcome = 'lost'; effect(state, p, 'explosion'); state.events.push('explosion');
	} else if (state.enemies.length === 0) {
		state.intermission += dt;
		if (state.intermission >= 6) {
			if (state.wave === 3) state.outcome = 'won';
			else {
				state.wave++; state.intermission = 0; p.hp = Math.min(MAX_HULL, p.hp + 280);
				state.shells = []; spawnWave(state);
			}
		}
	}
};
