import { getDifficultyDefinition, getWaveDefinition, WAVES, type Difficulty, type RefitChoice } from './operation';

export interface Point { x: number; y: number }
export type EnemyKind = 'scout' | 'striker' | 'siege';
export type CombatEvent = 'artillery' | 'refit' | 'cannon' | 'missile' | 'impact' | 'explosion' | 'wave' | 'pickup' | 'coolant' | 'overheat' | 'defeat' | 'victory';
export interface Unit extends Point { id: number; hp: number; maxHp: number; angle: number; cooldown: number; heavy: boolean; kind: EnemyKind; commander?: boolean }
export interface Shot extends Point { vx: number; vy: number; life: number; kind: 'cannon' | 'missile' | 'enemy'; target: number | undefined; damage: number }
export interface Effect extends Point { life: number; size: number; color: string }
export interface Salvage extends Point { id: number; kind: 'repair' | 'coolant'; life: number }
export interface Warning extends Point { kind: EnemyKind; life: number; commander?: boolean }
export interface ArtilleryStrike extends Point { id: number; life: number; duration: number; radius: number; damage: number }
export interface CombatStats { damageDealt: number; damageTaken: number; relayDamage: number; shotsFired: number; shotsHit: number; salvageRecovered: number; overheats: number; killScore: number; commanderDestroyed: boolean }
export interface Wreck extends Point { kind: EnemyKind; angle: number }
export interface Controls { drive: number; stop: boolean; turn: number; aim: Point; cannon: boolean; laser: boolean; missile: boolean; coolant: boolean }
export interface State {
	difficulty: Difficulty; phase: 'combat' | 'refit'; upgrades: Record<RefitChoice, number>; stats: CombatStats; strikes: ArtilleryStrike[];
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
	siege: { hp: 125, speed: 28, range: 550, reload: 4.8, damage: 10, aggro: 240 },
};
export const distance = function (a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); };
export const angleDelta = function (from: number, to: number) { return Math.atan2(Math.sin(to - from), Math.cos(to - from)); };
const clamp = function (value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); };
export const createState = function (options: { difficulty?: Difficulty } = {}): State {
	return {
		difficulty: options.difficulty ?? 'standard', phase: 'combat', upgrades: { arsenal: 0, cooling: 0, bastion: 0 }, strikes: [],
		stats: { damageDealt: 0, damageTaken: 0, relayDamage: 0, shotsFired: 0, shotsHit: 0, salvageRecovered: 0, overheats: 0, killScore: 0, commanderDestroyed: false },
		player: { x: 900, y: 780, angle: -Math.PI / 2, turret: -Math.PI / 2, throttle: 0, speed: 0, hp: 100, heat: 0, overheated: false },
		relay: 100, enemies: [], shots: [], effects: [], wave: 1, spawned: 0, spawnIn: 4, intermission: 0,
		cannonIn: 0, missileIn: 0, time: 0, kills: 0, shake: 0, beam: undefined, outcome: 'playing', nextId: 1,
		coolantCharges: 2, coolantHeld: false, salvage: [], warnings: [], wrecks: [], events: [],
	};
};
const burst = function (state: State, at: Point, size: number, color: string) { state.effects.push({ x: at.x, y: at.y, size, color, life: 0.5 }); };
const launch = function (state: State, kind: Shot['kind'], origin: Point, angle: number, target?: number, damage = 7) {
	if (kind !== 'enemy') state.stats.shotsFired++;
	const speed = kind === 'missile' ? 220 : kind === 'enemy' ? 230 : 650;
	state.shots.push({ x: origin.x + Math.cos(angle) * 30, y: origin.y + Math.sin(angle) * 30, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: kind === 'missile' ? 4 : kind === 'cannon' ? 1.3 : 2.5, kind, target, damage: kind === 'enemy' ? damage : (kind === 'cannon' ? 38 : 27) * (1 + state.upgrades.arsenal * 0.15) });
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
const hurtEnemy = function (state: State, enemy: Unit, damage: number) {
	state.stats.damageDealt += Math.min(Math.max(0, enemy.hp), damage);
	enemy.hp -= damage;
};
const hurtPlayer = function (state: State, damage: number) {
	const resisted = damage * Math.max(0.6, 1 - state.upgrades.bastion * 0.1);
	state.stats.damageTaken += Math.min(state.player.hp, resisted);
	state.player.hp = Math.max(0, state.player.hp - resisted);
	state.shake = 4;
};
const hurtRelay = function (state: State, damage: number) {
	state.stats.relayDamage += Math.min(state.relay, damage);
	state.relay = Math.max(0, state.relay - damage);
};
export const applyRefit = function (state: State, choice: RefitChoice): boolean {
	if (state.outcome !== 'playing' || state.phase !== 'refit' || state.wave >= WAVES.length) return false;
	state.upgrades[choice]++;
	state.player.hp = Math.min(100, state.player.hp + 25);
	state.player.heat = 0; state.player.overheated = false;
	state.player.throttle = 0; state.player.speed = 0;
	state.coolantCharges = Math.min(3, state.coolantCharges + (choice === 'cooling' ? 2 : 1));
	if (choice === 'bastion') state.relay = Math.min(100, state.relay + 12);
	state.coolantHeld = false;
	state.cannonIn = 0; state.missileIn = 0;
	state.wave++; state.spawned = 0; state.spawnIn = 4; state.intermission = 0; state.phase = 'combat';
	state.events = ['wave'];
	return true;
};
export interface OperationReport {
	score: number;
	rank: 'S' | 'A' | 'B' | 'C' | 'D';
	kills: number;
	time: number;
	relay: number;
	armor: number;
	accuracy: number;
	damageDealt: number;
	damageTaken: number;
	relayDamage: number;
	salvageRecovered: number;
	overheats: number;
	commanderDestroyed: boolean;
}
export const getOperationReport = function (state: State): OperationReport {
	const won = state.outcome === 'won';
	const completion = won ? 2000 + state.relay * 30 + state.player.hp * 10 + Math.max(0, 600 - state.time) * 4 : 0;
	const score = Math.floor((state.stats.killScore + completion) * getDifficultyDefinition(state.difficulty).scoreMultiplier);
	const rank = !won ? 'D' : state.relay >= 80 && state.player.hp >= 60 && state.stats.overheats <= 3 ? 'S' : state.relay >= 60 && state.player.hp >= 35 ? 'A' : state.relay >= 40 ? 'B' : 'C';
	return { score, rank, kills: state.kills, time: state.time, relay: Math.ceil(state.relay), armor: Math.ceil(state.player.hp), accuracy: state.stats.shotsFired > 0 ? Math.round(state.stats.shotsHit / state.stats.shotsFired * 100) : 0, damageDealt: Math.round(state.stats.damageDealt), damageTaken: Math.round(state.stats.damageTaken), relayDamage: Math.round(state.stats.relayDamage), salvageRecovered: state.stats.salvageRecovered, overheats: state.stats.overheats, commanderDestroyed: state.stats.commanderDestroyed };
};
export const step = function (state: State, input: Controls, dt: number) {
	state.events = [];
	if (state.outcome !== 'playing' || state.phase !== 'combat' || dt <= 0) return;
	dt = Math.min(dt, 0.04);
	const p = state.player;
	const difficulty = getDifficultyDefinition(state.difficulty);
	const wave = getWaveDefinition(state.wave);
	state.time += dt;
	state.cannonIn = Math.max(0, state.cannonIn - dt);
	state.missileIn = Math.max(0, state.missileIn - dt);
	state.shake = Math.max(0, state.shake - dt * 15);
	p.heat = Math.max(0, p.heat - dt * 12 * (1 + state.upgrades.cooling * 0.18));
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
			const target = state.enemies.filter(function (enemy) { return enemy.hp > 0 && distance(enemy, p) <= 900; }).reduce<Unit | undefined>(function (best, enemy) { return !best || distance(enemy, input.aim) < distance(best, input.aim) ? enemy : best; }, undefined);
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
			if (hit) hurtEnemy(state, hit.enemy, 48 * dt * (1 + state.upgrades.arsenal * 0.15));
			p.heat += 44 * dt;
		}
	}
	if (p.heat >= 100) { p.heat = 100; p.overheated = true; state.stats.overheats++; state.events.push('overheat'); }
	const quota = wave.enemies.length;
	state.spawnIn -= dt;
	if (state.spawned < quota && state.spawnIn <= 0) {
		const spawn = wave.enemies[state.spawned];
		if (!spawn) throw new Error('Missing wave spawn');
		const theta = state.spawned * 2.4 + wave.bearing;
		state.warnings.push({ x: 900 + Math.cos(theta) * 840, y: 600 + Math.sin(theta) * 530, ...spawn, life: spawn.commander ? 3 : 2 });
		if (state.spawned === 0 && state.wave === 1) state.events.push('wave');
		state.spawned++; state.spawnIn = state.wave === 1 ? wave.interval : state.spawned % 3 === 0 ? wave.interval * 2.4 : 1.8;
	}
	for (const warning of state.warnings) {
		warning.life -= dt;
		if (warning.life <= 0) {
			const stats = ENEMY_STATS[warning.kind];
			const hp = Math.round((warning.commander ? 420 : stats.hp) * difficulty.enemyArmor);
			state.enemies.push({ id: state.nextId++, x: warning.x, y: warning.y, hp, maxHp: hp, angle: Math.atan2(600 - warning.y, 900 - warning.x), cooldown: 1.2, heavy: warning.kind === 'siege', kind: warning.kind, ...(warning.commander ? { commander: true } : {}) });
		}
	}
	state.warnings = state.warnings.filter(function (warning) { return warning.life > 0; });
	for (const enemy of state.enemies) {
		if (enemy.hp <= 0) continue;
		const stats = ENEMY_STATS[enemy.kind];
		const target = enemy.commander || distance(enemy, p) < stats.aggro ? p : { x: ARENA.relayX, y: ARENA.relayY };
		enemy.angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
		const range = enemy.commander ? 690 : stats.range;
		if (distance(enemy, target) > range) { enemy.x += Math.cos(enemy.angle) * dt * stats.speed; enemy.y += Math.sin(enemy.angle) * dt * stats.speed; }
		enemy.cooldown -= dt;
		if (enemy.cooldown <= 0 && distance(enemy, target) < range + 50) {
			if (enemy.kind === 'siege') {
				const duration = enemy.commander ? 3 : 2.8;
				state.strikes.push({ id: state.nextId++, x: target.x, y: target.y, life: duration, duration, radius: enemy.commander ? 85 : 62, damage: (enemy.commander ? 16 : 10) * difficulty.enemyDamage });
				state.events.push('artillery');
			} else launch(state, 'enemy', enemy, enemy.angle, undefined, stats.damage * difficulty.enemyDamage);
			enemy.cooldown = enemy.commander ? enemy.hp < enemy.maxHp * 0.5 ? 3.4 : 4.4 : stats.reload;
		}
	}
	for (const strike of state.strikes) {
		strike.life -= dt;
		if (strike.life > 0) continue;
		if (distance(strike, p) < strike.radius + 20) hurtPlayer(state, strike.damage);
		if (distance(strike, { x: ARENA.relayX, y: ARENA.relayY }) < strike.radius + 30) hurtRelay(state, strike.damage * 0.6);
		burst(state, strike, strike.radius * 1.7, '#ff874d'); state.events.push('explosion');
	}
	state.strikes = state.strikes.filter(function (strike) { return strike.life > 0; });
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
				hurtPlayer(state, shot.damage); shot.life = 0; state.shake = 4; burst(state, p, 30, '#ff985d'); state.events.push('impact');
			} else if (relayHit !== undefined) {
				hurtRelay(state, shot.damage * 0.65); shot.life = 0; burst(state, relay, 30, '#ff985d'); state.events.push('impact');
			}
		} else {
			const hit = state.enemies.filter(function (enemy) { return enemy.hp > 0; }).map(function (enemy) { return { enemy, entry: hitFraction(origin, shot, enemy, 25) }; }).filter(function (candidate): candidate is { enemy: Unit; entry: number } { return candidate.entry !== undefined; }).sort(function (a, b) { return a.entry - b.entry || a.enemy.id - b.enemy.id; })[0];
			if (hit) {
				hurtEnemy(state, hit.enemy, shot.damage); state.stats.shotsHit++; shot.life = 0;
				burst(state, hit.enemy, shot.kind === 'cannon' ? 45 : 32, '#ffd28b'); state.shake = 2; state.events.push('impact');
			}
		}
	}
	state.shots = state.shots.filter(function (shot) { return shot.life > 0; });
	for (const enemy of state.enemies) if (enemy.hp <= 0) {
		state.kills++; state.stats.killScore += enemy.commander ? 1800 : enemy.kind === 'siege' ? 500 : enemy.kind === 'striker' ? 300 : 200;
		if (enemy.commander) state.stats.commanderDestroyed = true;
		burst(state, enemy, 65, '#ffab62'); state.events.push('explosion');
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
		state.stats.salvageRecovered++; state.events.push('pickup'); burst(state, p, 55, '#93e9e1'); return false;
	});
	if (p.hp <= 0 || state.relay <= 0) { state.outcome = 'lost'; state.events.push('defeat'); }
	else if (state.spawned === quota && state.enemies.length === 0 && state.warnings.length === 0 && state.strikes.length === 0 && !state.shots.some(function (shot) { return shot.kind === 'enemy'; })) {
		state.intermission += dt;
		if (state.intermission >= 4) {
			if (state.wave === WAVES.length) { state.outcome = 'won'; state.events.push('victory'); }
			else {
				state.phase = 'refit'; p.throttle = 0; p.speed = 0; state.beam = undefined;
				state.shots = []; state.effects = []; state.shake = 0; state.events.push('refit');
			}
		}
	}
};
