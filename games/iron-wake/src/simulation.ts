export interface Point { x: number; y: number }
export interface Unit extends Point { id: number; hp: number; angle: number; cooldown: number; heavy: boolean }
export interface Shot extends Point { vx: number; vy: number; life: number; kind: 'cannon' | 'missile' | 'enemy'; target: number | undefined }
export interface Effect extends Point { life: number; size: number; color: string }
export interface Controls { drive: number; turn: number; aim: Point; cannon: boolean; laser: boolean; missile: boolean }
export interface State {
	player: Point & { angle: number; turret: number; speed: number; hp: number; heat: number; overheated: boolean };
	relay: number; enemies: Unit[]; shots: Shot[]; effects: Effect[]; wave: number; spawned: number; spawnIn: number;
	intermission: number; cannonIn: number; missileIn: number; time: number; kills: number; shake: number;
	beam: Point | undefined; outcome: 'playing' | 'won' | 'lost'; nextId: number;
}
export const ARENA = { width: 1800, height: 1200, relayX: 900, relayY: 600 };
export const distance = function (a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); };
export const angleDelta = function (from: number, to: number) { return Math.atan2(Math.sin(to - from), Math.cos(to - from)); };
const clamp = function (value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); };
export const createState = function (): State {
	return { player: { x: 900, y: 780, angle: -Math.PI / 2, turret: -Math.PI / 2, speed: 0, hp: 100, heat: 0, overheated: false }, relay: 100, enemies: [], shots: [], effects: [], wave: 1, spawned: 0, spawnIn: 2, intermission: 0, cannonIn: 0, missileIn: 0, time: 0, kills: 0, shake: 0, beam: undefined, outcome: 'playing', nextId: 1 };
};
const burst = function (state: State, at: Point, size: number, color: string) { state.effects.push({ ...at, size, color, life: 0.5 }); };
const launch = function (state: State, kind: Shot['kind'], origin: Point, angle: number, target?: number) {
	const speed = kind === 'missile' ? 220 : kind === 'enemy' ? 230 : 650;
	state.shots.push({ x: origin.x + Math.cos(angle) * 30, y: origin.y + Math.sin(angle) * 30, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: kind === 'missile' ? 5 : 2.5, kind, target });
};
export const step = function (state: State, input: Controls, dt: number) {
	if (state.outcome !== 'playing' || dt <= 0) return;
	dt = Math.min(dt, 0.04);
	const p = state.player;
	state.time += dt;
	state.cannonIn = Math.max(0, state.cannonIn - dt);
	state.missileIn = Math.max(0, state.missileIn - dt);
	state.shake = Math.max(0, state.shake - dt * 15);
	p.heat = Math.max(0, p.heat - dt * 12);
	if (p.overheated && p.heat <= 35) p.overheated = false;
	p.angle += input.turn * dt * 1.05;
	p.speed += (input.drive * (input.drive < 0 ? 48 : 90) - p.speed) * Math.min(1, dt * 1.5);
	p.x = clamp(p.x + Math.cos(p.angle) * p.speed * dt, 35, ARENA.width - 35);
	p.y = clamp(p.y + Math.sin(p.angle) * p.speed * dt, 35, ARENA.height - 35);
	const aimAngle = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
	p.turret += clamp(angleDelta(p.turret, aimAngle), -dt * 2.3, dt * 2.3);
	state.beam = undefined;
	if (!p.overheated) {
		if (input.cannon && state.cannonIn === 0) {
			launch(state, 'cannon', p, p.turret);
			state.cannonIn = 0.65; p.heat += 8; state.shake = 3;
			p.speed -= 12;
			burst(state, { x: p.x + Math.cos(p.turret) * 36, y: p.y + Math.sin(p.turret) * 36 }, 20, '#ffe4a0');
		}
		if (input.missile && state.missileIn === 0) {
			const target = state.enemies.reduce<Unit | undefined>(function (best, enemy) { return !best || distance(enemy, input.aim) < distance(best, input.aim) ? enemy : best; }, undefined);
			for (const spread of [-0.3, 0, 0.3]) launch(state, 'missile', p, p.turret + spread, target?.id);
			state.missileIn = 4.5; p.heat += 15;
		}
		if (input.laser) {
			const reach = 620;
			const hit = state.enemies.map(function (enemy) {
				const dx = enemy.x - p.x; const dy = enemy.y - p.y;
				return { enemy, along: dx * Math.cos(p.turret) + dy * Math.sin(p.turret), across: Math.abs(dx * Math.sin(p.turret) - dy * Math.cos(p.turret)) };
			}).filter(function (candidate) { return candidate.along > 0 && candidate.along < reach && candidate.across < 24; }).sort(function (a, b) { return a.along - b.along; })[0];
			const length = hit?.along ?? reach;
			state.beam = { x: p.x + Math.cos(p.turret) * length, y: p.y + Math.sin(p.turret) * length };
			if (hit) hit.enemy.hp -= 48 * dt;
			p.heat += 44 * dt;
		}
	}
	if (p.heat >= 100) { p.heat = 100; p.overheated = true; }
	const quota = 3 + state.wave * 2;
	state.spawnIn -= dt;
	if (state.spawned < quota && state.spawnIn <= 0) {
		const theta = state.spawned * 2.4 + state.wave * 1.6;
		state.enemies.push({ id: state.nextId++, x: 900 + Math.cos(theta) * 840, y: 600 + Math.sin(theta) * 530, hp: state.wave === 3 ? 95 : 65, angle: theta + Math.PI, cooldown: 1.5, heavy: state.wave === 3 });
		state.spawned++; state.spawnIn = 3.2;
	}
	for (const enemy of state.enemies) {
		if (enemy.hp <= 0) continue;
		const target = distance(enemy, p) < 370 ? p : { x: ARENA.relayX, y: ARENA.relayY };
		enemy.angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
		if (distance(enemy, target) > 230) { enemy.x += Math.cos(enemy.angle) * dt * (enemy.heavy ? 30 : 44); enemy.y += Math.sin(enemy.angle) * dt * (enemy.heavy ? 30 : 44); }
		enemy.cooldown -= dt;
		if (enemy.cooldown <= 0 && distance(enemy, target) < 520) { launch(state, 'enemy', enemy, enemy.angle); enemy.cooldown = enemy.heavy ? 1.7 : 2.4; }
	}
	for (const shot of state.shots) {
		shot.life -= dt;
		if (shot.kind === 'missile') {
			const target = state.enemies.find(function (enemy) { return enemy.id === shot.target && enemy.hp > 0; });
			if (target) {
				const heading = Math.atan2(shot.vy, shot.vx);
				const angle = heading + clamp(angleDelta(heading, Math.atan2(target.y - shot.y, target.x - shot.x)), -dt * 3, dt * 3);
				shot.vx = Math.cos(angle) * 270; shot.vy = Math.sin(angle) * 270;
			}
		}
		// Sweep each movement segment so fast shells cannot skip a target at low frame rates.
		const origin = { x: shot.x, y: shot.y };
		shot.x += shot.vx * dt; shot.y += shot.vy * dt;
		const intersects = function (at: Point, radius: number) {
			const dx = shot.x - origin.x; const dy = shot.y - origin.y;
			const t = clamp(((at.x - origin.x) * dx + (at.y - origin.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
			return distance(at, { x: origin.x + dx * t, y: origin.y + dy * t }) < radius;
		};
		if (shot.kind === 'enemy') {
			if (intersects(p, 27)) { p.hp -= 7; shot.life = 0; state.shake = 4; burst(state, p, 30, '#ff985d'); }
			else if (intersects({ x: ARENA.relayX, y: ARENA.relayY }, 42)) { state.relay -= 5; shot.life = 0; burst(state, shot, 30, '#ff985d'); }
		} else {
			const hit = state.enemies.find(function (enemy) { return enemy.hp > 0 && intersects(enemy, 25); });
			if (hit) {
				hit.hp -= shot.kind === 'cannon' ? 38 : 27; shot.life = 0;
				burst(state, hit, shot.kind === 'cannon' ? 45 : 32, '#ffd28b'); state.shake = 2;
			}
		}
	}
	state.shots = state.shots.filter(function (shot) { return shot.life > 0; });
	for (const enemy of state.enemies) if (enemy.hp <= 0) { state.kills++; burst(state, enemy, 65, '#ffab62'); }
	state.enemies = state.enemies.filter(function (enemy) { return enemy.hp > 0; });
	state.effects = state.effects.filter(function (effect) { effect.life -= dt; return effect.life > 0; });
	if (p.hp <= 0 || state.relay <= 0) state.outcome = 'lost';
	else if (state.spawned === quota && state.enemies.length === 0) {
		state.intermission += dt;
		if (state.intermission >= 4) {
			if (state.wave === 3) state.outcome = 'won';
			else { state.wave++; state.spawned = 0; state.spawnIn = 2; state.intermission = 0; p.hp = Math.min(100, p.hp + 20); }
		}
	}
};
