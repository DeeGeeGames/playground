export interface Point { x: number; y: number }
export type EnemyKind = 'scout' | 'striker' | 'siege';
export type CombatEvent = 'cannon' | 'missile' | 'impact' | 'explosion' | 'wave' | 'pickup' | 'coolant' | 'overheat' | 'defeat' | 'victory';
export interface Unit extends Point { id: number; hp: number; maxHp: number; angle: number; cooldown: number; heavy: boolean; kind: EnemyKind }
export interface Shot extends Point { vx: number; vy: number; life: number; kind: 'cannon' | 'missile' | 'enemy'; target: number | undefined; damage: number }
export interface Effect extends Point { life: number; size: number; color: string }
export interface Salvage extends Point { id: number; kind: 'repair' | 'coolant'; life: number }
export interface Warning extends Point { kind: EnemyKind; life: number }
export interface Wreck extends Point { kind: EnemyKind; angle: number }
export interface Controls { drive: number; stop: boolean; turn: number; aim: Point; cannon: boolean; laser: boolean; missile: boolean; coolant: boolean }
export interface State {
	player: Point & { angle: number; turret: number; throttle: number; speed: number; hp: number; heat: number; overheated: boolean };
	relay: number; enemies: Unit[]; shots: Shot[]; effects: Effect[]; wave: number; spawned: number; spawnIn: number;
	intermission: number; cannonIn: number; missileIn: number; time: number; kills: number; shake: number;
	beam: Point | undefined; outcome: 'playing' | 'won' | 'lost'; nextId: number;
	coolantCharges: number; coolantHeld: boolean; salvage: Salvage[]; warnings: Warning[]; wrecks: Wreck[]; events: CombatEvent[];
}
export const ARENA = { width: 1800, height: 1200, relayX: 900, relayY: 600 };
interface EnemyStats { hp: number; speed: number; range: number; reload: number; damage: number; aggro: number }
export const ENEMY_STATS: Readonly<Record<EnemyKind, EnemyStats>> = {
	scout: { hp: 48, speed: 66, range: 170, reload: 2, damage: 5, aggro: 650 },
	striker: { hp: 76, speed: 44, range: 240, reload: 2.5, damage: 7, aggro: 440 },
	siege: { hp: 125, speed: 28, range: 390, reload: 3.2, damage: 10, aggro: 240 },
};
export const distance = function (a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); };
export const angleDelta = function (from: number, to: number) { return Math.atan2(Math.sin(to - from), Math.cos(to - from)); };
const clamp = function (value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); };
export const createState = function (): State {
	return {
		player: { x: 900, y: 780, angle: -Math.PI / 2, turret: -Math.PI / 2, throttle: 0, speed: 0, hp: 100, heat: 0, overheated: false },
		relay: 100, enemies: [], shots: [], effects: [], wave: 1, spawned: 0, spawnIn: 2, intermission: 0,
		cannonIn: 0, missileIn: 0, time: 0, kills: 0, shake: 0, beam: undefined, outcome: 'playing', nextId: 1,
		coolantCharges: 2, coolantHeld: false, salvage: [], warnings: [], wrecks: [], events: [],
	};
};
const burst = function (state: State, at: Point, size: number, color: string) { state.effects.push({ x: at.x, y: at.y, size, color, life: 0.5 }); };
const launch = function (state: State, kind: Shot['kind'], origin: Point, angle: number, target?: number, damage = 7) {
	const speed = kind === 'missile' ? 220 : kind === 'enemy' ? 230 : 650;
	state.shots.push({ x: origin.x + Math.cos(angle) * 30, y: origin.y + Math.sin(angle) * 30, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: kind === 'missile' ? 5 : 2.5, kind, target, damage: kind === 'cannon' ? 38 : kind === 'missile' ? 27 : damage });
};
// Return the earliest entry into a circle along a finite movement segment.
const hitFraction = function (from: Point, to: Point, target: Point, radius: number): number | undefined {
	const dx = to.x - from.x; const dy = to.y - from.y;
	const ox = from.x - target.x; const oy = from.y - target.y;
	const c = ox * ox + oy * oy - radius * radius;
	if (c <= 0) return 0;
	const a = dx * dx + dy * dy;
	if (a === 0) return undefined;
	const b = ox * dx + oy * dy;
	const discriminant = b * b - a * c;
	if (discriminant < 0) return undefined;
	const entry = (-b - Math.sqrt(discriminant)) / a;
	return entry >= 0 && entry <= 1 ? entry : undefined;
};
const enemyKind = function (wave: number, index: number): EnemyKind {
	if (wave === 1) return index % 3 === 2 ? 'striker' : 'scout';
	if (wave === 2) return index % 4 === 3 ? 'siege' : index % 2 === 0 ? 'scout' : 'striker';
	return index % 3 === 2 ? 'siege' : index % 3 === 1 ? 'striker' : 'scout';
};
export const step = function (state: State, input: Controls, dt: number) {
	state.events = [];
	if (state.outcome !== 'playing' || dt <= 0) return;
	dt = Math.min(dt, 0.04);
	const p = state.player;
	state.time += dt;
	state.cannonIn = Math.max(0, state.cannonIn - dt);
	state.missileIn = Math.max(0, state.missileIn - dt);
	state.shake = Math.max(0, state.shake - dt * 15);
	p.heat = Math.max(0, p.heat - dt * 12);
	if (input.coolant && !state.coolantHeld && state.coolantCharges > 0 && p.heat > 0) {
		state.coolantCharges--; p.heat = Math.max(0, p.heat - 55);
		state.events.push('coolant'); burst(state, p, 80, '#93e9e1');
	}
	state.coolantHeld = input.coolant;
	if (p.overheated && p.heat <= 35) p.overheated = false;
	p.angle += input.turn * dt * 1.05;
	// Drive input adjusts the engine setting; releasing it holds that setting.
	p.throttle = input.stop ? 0 : clamp(p.throttle + input.drive * dt * 0.75, -1, 1);
	p.speed += (p.throttle * (p.throttle < 0 ? 48 : 90) - p.speed) * Math.min(1, dt * 1.5);
	p.x = clamp(p.x + Math.cos(p.angle) * p.speed * dt, 35, ARENA.width - 35);
	p.y = clamp(p.y + Math.sin(p.angle) * p.speed * dt, 35, ARENA.height - 35);
	const aimAngle = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
	p.turret += clamp(angleDelta(p.turret, aimAngle), -dt * 2.3, dt * 2.3);
	state.beam = undefined;
	if (!p.overheated) {
		if (input.cannon && state.cannonIn === 0) {
			launch(state, 'cannon', p, p.turret);
			state.cannonIn = 0.65; p.heat += 8; state.shake = 3; state.events.push('cannon');
			burst(state, { x: p.x + Math.cos(p.turret) * 36, y: p.y + Math.sin(p.turret) * 36 }, 20, '#ffe4a0');
		}
		if (input.missile && state.missileIn === 0) {
			const target = state.enemies.filter(function (enemy) { return enemy.hp > 0; }).reduce<Unit | undefined>(function (best, enemy) { return !best || distance(enemy, input.aim) < distance(best, input.aim) ? enemy : best; }, undefined);
			for (const spread of [-0.3, 0, 0.3]) launch(state, 'missile', p, p.turret + spread, target?.id);
			state.missileIn = 4.5; p.heat += 15; state.events.push('missile');
		}
		if (input.laser) {
			const reach = 620;
			const hit = state.enemies.filter(function (enemy) { return enemy.hp > 0; }).map(function (enemy) {
				const dx = enemy.x - p.x; const dy = enemy.y - p.y;
				return { enemy, along: dx * Math.cos(p.turret) + dy * Math.sin(p.turret), across: Math.abs(dx * Math.sin(p.turret) - dy * Math.cos(p.turret)) };
			}).filter(function (candidate) { return candidate.along > 0 && candidate.along < reach && candidate.across < 24; }).sort(function (a, b) { return a.along - b.along; })[0];
			const length = hit?.along ?? reach;
			state.beam = { x: p.x + Math.cos(p.turret) * length, y: p.y + Math.sin(p.turret) * length };
			if (hit) hit.enemy.hp -= 48 * dt;
			p.heat += 44 * dt;
		}
	}
	if (p.heat >= 100) { p.heat = 100; p.overheated = true; state.events.push('overheat'); }
	const quota = 3 + state.wave * 2;
	state.spawnIn -= dt;
	if (state.spawned < quota && state.spawnIn <= 0) {
		const theta = state.spawned * 2.4 + state.wave * 1.6;
		state.warnings.push({ x: 900 + Math.cos(theta) * 840, y: 600 + Math.sin(theta) * 530, kind: enemyKind(state.wave, state.spawned), life: 2 });
		if (state.spawned === 0 && state.wave === 1) state.events.push('wave');
		state.spawned++; state.spawnIn = state.wave === 3 ? 3.6 : 4;
	}
	for (const warning of state.warnings) {
		warning.life -= dt;
		if (warning.life <= 0) {
			const stats = ENEMY_STATS[warning.kind];
			state.enemies.push({ id: state.nextId++, x: warning.x, y: warning.y, hp: stats.hp, maxHp: stats.hp, angle: Math.atan2(600 - warning.y, 900 - warning.x), cooldown: 1.2, heavy: warning.kind === 'siege', kind: warning.kind });
		}
	}
	state.warnings = state.warnings.filter(function (warning) { return warning.life > 0; });
	for (const enemy of state.enemies) {
		if (enemy.hp <= 0) continue;
		const stats = ENEMY_STATS[enemy.kind];
		const target = distance(enemy, p) < stats.aggro ? p : { x: ARENA.relayX, y: ARENA.relayY };
		enemy.angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
		if (distance(enemy, target) > stats.range) { enemy.x += Math.cos(enemy.angle) * dt * stats.speed; enemy.y += Math.sin(enemy.angle) * dt * stats.speed; }
		enemy.cooldown -= dt;
		if (enemy.cooldown <= 0 && distance(enemy, target) < stats.range + 50) { launch(state, 'enemy', enemy, enemy.angle, undefined, stats.damage); enemy.cooldown = stats.reload; }
	}
	for (const shot of state.shots) {
		const travel = Math.min(dt, Math.max(0, shot.life));
		shot.life -= dt;
		if (shot.kind === 'missile') {
			const target = state.enemies.find(function (enemy) { return enemy.id === shot.target && enemy.hp > 0; });
			if (target) {
				const heading = Math.atan2(shot.vy, shot.vx);
				const angle = heading + clamp(angleDelta(heading, Math.atan2(target.y - shot.y, target.x - shot.x)), -travel * 3, travel * 3);
				shot.vx = Math.cos(angle) * 270; shot.vy = Math.sin(angle) * 270;
			}
		}
		const origin = { x: shot.x, y: shot.y };
		shot.x += shot.vx * travel; shot.y += shot.vy * travel;
		if (shot.kind === 'enemy') {
			const relay = { x: ARENA.relayX, y: ARENA.relayY };
			const playerHit = hitFraction(origin, shot, p, 27); const relayHit = hitFraction(origin, shot, relay, 42);
			if (playerHit !== undefined && (relayHit === undefined || playerHit <= relayHit)) {
				p.hp = Math.max(0, p.hp - shot.damage); shot.life = 0; state.shake = 4; burst(state, p, 30, '#ff985d'); state.events.push('impact');
			} else if (relayHit !== undefined) {
				state.relay = Math.max(0, state.relay - Math.ceil(shot.damage * 0.65)); shot.life = 0; burst(state, relay, 30, '#ff985d'); state.events.push('impact');
			}
		} else {
			const hit = state.enemies.filter(function (enemy) { return enemy.hp > 0; }).map(function (enemy) { return { enemy, entry: hitFraction(origin, shot, enemy, 25) }; }).filter(function (candidate): candidate is { enemy: Unit; entry: number } { return candidate.entry !== undefined; }).sort(function (a, b) { return a.entry - b.entry || a.enemy.id - b.enemy.id; })[0];
			if (hit) {
				hit.enemy.hp -= shot.damage; shot.life = 0;
				burst(state, hit.enemy, shot.kind === 'cannon' ? 45 : 32, '#ffd28b'); state.shake = 2; state.events.push('impact');
			}
		}
	}
	state.shots = state.shots.filter(function (shot) { return shot.life > 0; });
	for (const enemy of state.enemies) if (enemy.hp <= 0) {
		state.kills++; burst(state, enemy, 65, '#ffab62'); state.events.push('explosion');
		state.wrecks.push({ x: enemy.x, y: enemy.y, angle: enemy.angle, kind: enemy.kind });
		if (state.kills % 2 === 0) state.salvage.push({ id: state.nextId++, x: enemy.x, y: enemy.y, kind: state.kills % 4 === 0 ? 'coolant' : 'repair', life: 45 });
	}
	state.enemies = state.enemies.filter(function (enemy) { return enemy.hp > 0; });
	state.effects = state.effects.filter(function (effect) { effect.life -= dt; return effect.life > 0; });
	state.salvage = state.salvage.filter(function (salvage) {
		salvage.life -= dt;
		if (salvage.life <= 0) return false;
		if (p.hp <= 0 || distance(salvage, p) > 55 || (salvage.kind === 'repair' ? p.hp >= 100 : state.coolantCharges >= 3)) return true;
		if (salvage.kind === 'repair') p.hp = Math.min(100, p.hp + 22);
		else state.coolantCharges = Math.min(3, state.coolantCharges + 1);
		state.events.push('pickup'); burst(state, p, 55, '#93e9e1'); return false;
	});
	if (p.hp <= 0 || state.relay <= 0) { state.outcome = 'lost'; state.events.push('defeat'); }
	else if (state.spawned === quota && state.enemies.length === 0 && state.warnings.length === 0) {
		state.intermission += dt;
		if (state.intermission >= 4) {
			if (state.wave === 3) { state.outcome = 'won'; state.events.push('victory'); }
			else {
				state.wave++; state.spawned = 0; state.spawnIn = 2; state.intermission = 0;
				p.hp = Math.min(100, p.hp + 20); state.coolantCharges = Math.min(3, state.coolantCharges + 1); state.events.push('wave');
			}
		}
	}
};
