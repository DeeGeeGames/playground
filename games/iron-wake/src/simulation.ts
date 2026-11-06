import { createMount, DRAFT_MILESTONES, getWeapon, MAX_WEAPON_LEVEL, WEAPONS, weaponDamage, type FireInputs, type WeaponDefinition, type WeaponId, type WeaponMount } from './arsenal';
import { getFrame, type FrameId } from './frames';
import { getDifficultyDefinition, getWaveDefinition, WAVES, type Difficulty, type RefitChoice } from './operation';

export interface Point { x: number; y: number }
export type EnemyKind = 'scout' | 'striker' | 'siege';
export type CombatEvent = 'artillery' | 'refit' | 'requisition' | 'machine-gun' | 'ppc' | 'rocket' | 'cannon' | 'missile' | 'impact' | 'player-hit' | 'relay-hit' | 'explosion' | 'wave' | 'pickup' | 'coolant' | 'overheat' | 'defeat' | 'victory';
export interface AttackCycle { phase: 'committed' | 'recovery'; remaining: number; cycle: number }
export interface Unit extends Point { id: number; hp: number; maxHp: number; angle: number; cooldown: number; heavy: boolean; kind: EnemyKind; commander?: boolean; attack?: AttackCycle }
export interface Shot extends Point { vx: number; vy: number; life: number; kind: 'cannon' | 'missile' | 'enemy' | 'bullet' | 'ppc' | 'rocket'; target: number | undefined; damage: number; splash?: number; hitIds?: number[] }
export interface Effect extends Point { life: number; size: number; color: string }
export interface Salvage extends Point { id: number; kind: 'repair' | 'coolant'; life: number }
export interface Warning extends Point { kind: EnemyKind; life: number; commander?: boolean }
export interface ArtilleryStrike extends Point { id: number; life: number; duration: number; radius: number; damage: number }
export interface CombatStats { damageDealt: number; damageTaken: number; relayDamage: number; shotsFired: number; shotsHit: number; salvageRecovered: number; overheats: number; killScore: number; commanderDestroyed: boolean }
export interface Wreck extends Point { kind: EnemyKind; angle: number }
export interface Controls { drive: number; stop: boolean; turn: number; aim: Point; fire: FireInputs; coolant: boolean }
export interface State {
	frame: FrameId; difficulty: Difficulty; phase: 'combat' | 'refit' | 'requisition'; loadout: WeaponMount[]; draftCount: number; offers: WeaponId[]; seed: number; draftsEnabled: boolean; upgrades: Record<RefitChoice, number>; stats: CombatStats; strikes: ArtilleryStrike[];
	player: Point & { angle: number; turret: number; throttle: number; speed: number; hp: number; heat: number; overheated: boolean };
	relay: number; enemies: Unit[]; shots: Shot[]; effects: Effect[]; wave: number; spawned: number; spawnIn: number;
	intermission: number; cannonIn: number; time: number; kills: number; shake: number;
	beam: Point | undefined; outcome: 'playing' | 'won' | 'lost'; nextId: number;
	coolantCharges: number; coolantHeld: boolean; salvage: Salvage[]; warnings: Warning[]; wrecks: Wreck[]; events: CombatEvent[];
}
export const ARENA = { width: 1800, height: 1200, relayX: 900, relayY: 600 };
interface EnemyStats { hp: number; speed: number; range: number; reload: number; damage: number; aggro: number }
export const ENEMY_STATS: Readonly<Record<EnemyKind, EnemyStats>> = {
	scout: { hp: 48, speed: 66, range: 170, reload: 2, damage: 5, aggro: 650 },
	striker: { hp: 76, speed: 44, range: 240, reload: 2.5, damage: 7, aggro: 440 },
	siege: { hp: 125, speed: 28, range: 550, reload: 1.8, damage: 10, aggro: 650 },
};
export const distance = function (a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); };
export const angleDelta = function (from: number, to: number) { return Math.atan2(Math.sin(to - from), Math.cos(to - from)); };
const clamp = function (value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); };
export const createState = function (options: { difficulty?: Difficulty; frame?: FrameId; starter?: WeaponId; seed?: number } = {}): State {
	const frame = getFrame(options.frame ?? 'warden');
	return {
		frame: frame.id, difficulty: options.difficulty ?? 'standard', phase: 'combat', loadout: [createMount(options.starter ?? frame.starter)], draftCount: 0, offers: [], seed: options.seed ?? 1, draftsEnabled: true, upgrades: { arsenal: 0, cooling: 0, bastion: 0 }, strikes: [],
		stats: { damageDealt: 0, damageTaken: 0, relayDamage: 0, shotsFired: 0, shotsHit: 0, salvageRecovered: 0, overheats: 0, killScore: 0, commanderDestroyed: false },
		player: { x: 900, y: 780, angle: -Math.PI / 2, turret: -Math.PI / 2, throttle: 0, speed: 0, hp: 100, heat: 0, overheated: false },
		relay: 100, enemies: [], shots: [], effects: [], wave: 1, spawned: 0, spawnIn: 4, intermission: 0,
		cannonIn: 0, time: 0, kills: 0, shake: 0, beam: undefined, outcome: 'playing', nextId: 1,
		coolantCharges: 2, coolantHeld: false, salvage: [], warnings: [], wrecks: [], events: [],
	};
};
const burst = function (state: State, at: Point, size: number, color: string) { state.effects.push({ x: at.x, y: at.y, size, color, life: 0.5 }); };
const launchEnemy = function (state: State, origin: Point, angle: number, damage: number) {
	state.shots.push({ x: origin.x + Math.cos(angle) * 30, y: origin.y + Math.sin(angle) * 30, vx: Math.cos(angle) * 230, vy: Math.sin(angle) * 230, life: 2.5, kind: 'enemy', target: undefined, damage });
};
const launchWeapon = function (state: State, weapon: WeaponDefinition, mount: WeaponMount, angle: number, target?: number) {
	if (weapon.kind === 'laser') return;
	const p = state.player;
	state.stats.shotsFired++;
	state.shots.push({ x: p.x + Math.cos(angle) * 30, y: p.y + Math.sin(angle) * 30,
		vx: Math.cos(angle) * weapon.speed, vy: Math.sin(angle) * weapon.speed, life: weapon.range / weapon.speed,
		kind: weapon.kind, target, damage: weaponDamage(weapon, mount.level) * (1 + state.upgrades.arsenal * 0.15),
		...(weapon.splash > 0 ? { splash: weapon.splash } : {}), ...(weapon.kind === 'ppc' ? { hitIds: [] } : {}) });
};
const random = function (state: State) {
	state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
	return state.seed / 4294967296;
};
const prepareRequisition = function (state: State): boolean {
	const threshold = DRAFT_MILESTONES[state.draftCount];
	if (!state.draftsEnabled || threshold === undefined || state.kills < threshold || state.outcome !== 'playing') return false;
	const unowned = WEAPONS.filter(function (weapon) { return !state.loadout.some(function (mount) { return mount.weapon === weapon.id; }); }).map(function (weapon) { return weapon.id; });
	const upgrades = state.loadout.filter(function (mount) { return mount.level < MAX_WEAPON_LEVEL; }).map(function (mount) { return mount.weapon; });
	const candidates = state.loadout.length < 4 ? unowned : [...unowned, ...upgrades];
	const offers: WeaponId[] = [];
	if (state.loadout.length === 4 && upgrades.length > 0) {
		const guaranteed = upgrades[Math.floor(random(state) * upgrades.length)];
		if (guaranteed) offers.push(guaranteed);
	}
	while (offers.length < 3 && candidates.length > 0) {
		const index = Math.floor(random(state) * candidates.length);
		const candidate = candidates.splice(index, 1)[0];
		if (candidate && !offers.includes(candidate)) offers.push(candidate);
	}
	state.offers = offers; state.phase = 'requisition'; state.beam = undefined;
	for (const mount of state.loadout) mount.firing = false;
	state.events.push('requisition');
	return true;
};
export const chooseWeapon = function (state: State, weapon: WeaponId, replaceSlot?: number): boolean {
	if (state.phase !== 'requisition' || state.outcome !== 'playing' || !state.offers.includes(weapon)) return false;
	const installed = state.loadout.find(function (mount) { return mount.weapon === weapon; });
	if (installed) {
		if (installed.level >= MAX_WEAPON_LEVEL) return false;
		installed.level++; installed.cooldown = 0;
	} else if (state.loadout.length < 4) state.loadout.push(createMount(weapon));
	else {
		if (replaceSlot === undefined || !Number.isInteger(replaceSlot) || replaceSlot < 0 || replaceSlot >= state.loadout.length) return false;
		state.loadout[replaceSlot] = createMount(weapon);
	}
	state.draftCount++; state.offers = []; state.phase = 'combat'; state.events = ['refit'];
	// A multi-kill can earn several choices. Resolve each before time resumes.
	prepareRequisition(state);
	return true;
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
export const getEnemyDefense = function (state: State, enemy: Unit): { frontalMultiplier: number; exposed: boolean; enraged: boolean } {
	return {
		frontalMultiplier: enemy.kind !== 'siege' ? 1 : state.difficulty === 'story' ? 0.8 : enemy.commander ? 0.24 : 0.35,
		exposed: enemy.kind === 'siege' && enemy.attack?.phase === 'recovery',
		enraged: Boolean(enemy.commander) && enemy.hp < enemy.maxHp * 0.5,
	};
};
const hurtEnemy = function (state: State, enemy: Unit, damage: number, from: Point) {
	const defense = getEnemyDefense(state, enemy);
	const frontal = Math.abs(angleDelta(enemy.angle, Math.atan2(from.y - enemy.y, from.x - enemy.x))) < Math.PI / 3;
	const applied = damage * (defense.exposed ? 1.35 : frontal ? defense.frontalMultiplier : 1);
	state.stats.damageDealt += Math.min(Math.max(0, enemy.hp), applied);
	enemy.hp -= applied;
};
const hurtPlayer = function (state: State, damage: number) {
	const resisted = damage * getFrame(state.frame).incomingDamage * Math.max(0.6, 1 - state.upgrades.bastion * 0.1);
	if (resisted > 0 && state.player.hp > 0) state.events.push('player-hit');
	state.stats.damageTaken += Math.min(state.player.hp, resisted);
	state.player.hp = Math.max(0, state.player.hp - resisted);
	state.shake = 4;
};
const hurtRelay = function (state: State, damage: number) {
	if (damage > 0 && state.relay > 0) state.events.push('relay-hit');
	state.stats.relayDamage += Math.min(state.relay, damage);
	state.relay = Math.max(0, state.relay - damage);
};
const commitBarrage = function (state: State, enemy: Unit, target: Point) {
	const commander = Boolean(enemy.commander);
	const enraged = getEnemyDefense(state, enemy).enraged;
	const permissive = state.difficulty === 'story';
	const duration = commander ? 3.2 : 2.8;
	const radius = commander ? 82 : 62;
	const damage = (commander ? 16 : 10) * getDifficultyDefinition(state.difficulty).enemyDamage;
	const addStrike = function (at: Point, delay: number, size = radius) {
		state.strikes.push({ id: state.nextId++, x: at.x, y: at.y, life: delay, duration: delay, radius: size, damage });
	};
	// Every marker commits now. Neither movement nor destruction of the firing
	// frame can move or erase incoming ordnance.
	const pulses = permissive ? 1 : commander ? 3 : 2;
	for (let pulse = 0; pulse < pulses; pulse++) addStrike(target, duration + pulse * 0.7);
	if (commander && !permissive) {
		const offsets = enraged ? [-Math.PI / 2, 0, Math.PI / 2, Math.PI] : [-Math.PI / 2, Math.PI / 2];
		for (const offset of offsets) {
			const heading = enemy.angle + offset;
			addStrike({ x: target.x + Math.cos(heading) * 175, y: target.y + Math.sin(heading) * 175 }, duration + 1.4, 58);
		}
	}
	enemy.attack = { phase: 'committed', remaining: duration + (pulses - 1) * 0.7, cycle: enraged ? 2 : 1 };
	state.events.push('artillery');
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
	state.cannonIn = 0;
	for (const mount of state.loadout) { mount.cooldown = 0; mount.firing = false; }
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
	const frame = getFrame(state.frame);
	const wave = getWaveDefinition(state.wave);
	state.time += dt;
	state.cannonIn = Math.max(0, state.cannonIn - dt);
	for (const mount of state.loadout) { mount.cooldown = Math.max(0, mount.cooldown - dt); mount.firing = false; }
	state.shake = Math.max(0, state.shake - dt * 15);
	p.heat = Math.max(0, p.heat - dt * frame.cooling * (1 + state.upgrades.cooling * 0.18));
	if (input.coolant && !state.coolantHeld && state.coolantCharges > 0 && p.heat > 0) {
		state.coolantCharges--; p.heat = Math.max(0, p.heat - 55);
		state.events.push('coolant'); burst(state, p, 80, '#93e9e1');
	}
	state.coolantHeld = input.coolant;
	if (p.overheated && p.heat <= 35) p.overheated = false;
	p.angle += input.turn * dt * frame.turnRate;
	// Drive input adjusts the engine setting; releasing it holds that setting.
	p.throttle = input.stop ? 0 : clamp(p.throttle + input.drive * dt * 0.75, -1, 1);
	p.speed += (p.throttle * (p.throttle < 0 ? frame.reverseSpeed : frame.speed) - p.speed) * Math.min(1, dt * frame.acceleration);
	p.x = clamp(p.x + Math.cos(p.angle) * p.speed * dt, 35, ARENA.width - 35);
	p.y = clamp(p.y + Math.sin(p.angle) * p.speed * dt, 35, ARENA.height - 35);
	const aimAngle = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
	p.turret += clamp(angleDelta(p.turret, aimAngle), -dt * frame.turretRate, dt * frame.turretRate);
	state.beam = undefined;
	if (!p.overheated) state.loadout.forEach(function (mount, index) {
		if (!input.fire[index]) return;
		const weapon = getWeapon(mount.weapon);
		if (weapon.kind === 'laser') {
			const hit = state.enemies.filter(function (enemy) { return enemy.hp > 0; }).map(function (enemy) {
				const dx = enemy.x - p.x; const dy = enemy.y - p.y;
				return { enemy, along: dx * Math.cos(p.turret) + dy * Math.sin(p.turret), across: Math.abs(dx * Math.sin(p.turret) - dy * Math.cos(p.turret)) };
			}).filter(function (candidate) { return candidate.along > 0 && candidate.along < weapon.range && candidate.across < 24; }).sort(function (a, b) { return a.along - b.along; })[0];
			const length = hit?.along ?? weapon.range;
			state.beam = { x: p.x + Math.cos(p.turret) * length, y: p.y + Math.sin(p.turret) * length };
			if (hit) hurtEnemy(state, hit.enemy, weaponDamage(weapon, mount.level) * dt * (1 + state.upgrades.arsenal * 0.15), p);
			p.heat += weapon.heat * dt; mount.firing = true;
			return;
		}
		if (mount.cooldown > 0) return;
		const target = weapon.kind === 'missile' ? state.enemies.filter(function (enemy) { return enemy.hp > 0 && distance(enemy, p) <= weapon.range; }).reduce<Unit | undefined>(function (best, enemy) { return !best || distance(enemy, input.aim) < distance(best, input.aim) ? enemy : best; }, undefined) : undefined;
		for (let projectile = 0; projectile < weapon.projectiles; projectile++) {
			const spread = weapon.projectiles === 1 ? Math.sin(state.stats.shotsFired * 2.4) * weapon.spread : (projectile - (weapon.projectiles - 1) / 2) * weapon.spread;
			launchWeapon(state, weapon, mount, p.turret + spread, target?.id);
		}
		mount.cooldown = weapon.interval; mount.firing = true; p.heat += weapon.heat;
		if (weapon.kind === 'cannon' || weapon.kind === 'ppc') { state.cannonIn = 0.65; state.shake = weapon.kind === 'ppc' ? 4 : 3; }
		state.events.push(weapon.kind === 'bullet' ? 'machine-gun' : weapon.kind);
		burst(state, { x: p.x + Math.cos(p.turret) * 36, y: p.y + Math.sin(p.turret) * 36 }, weapon.kind === 'bullet' ? 9 : 20, weapon.color);
	});
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
		if (enemy.attack) {
			enemy.attack.remaining -= dt;
			if (enemy.attack.remaining <= 0) {
				if (enemy.attack.phase === 'committed') { enemy.attack.phase = 'recovery'; enemy.attack.remaining = enemy.commander ? 4.2 : 3.2; }
				else { delete enemy.attack; enemy.cooldown = enemy.commander ? getEnemyDefense(state, enemy).enraged ? 1.2 : 2.2 : stats.reload; }
			}
			continue;
		}
		const targetAngle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
		enemy.angle = enemy.kind === 'siege' ? enemy.angle + clamp(angleDelta(enemy.angle, targetAngle), -dt * 0.65, dt * 0.65) : targetAngle;
		const range = enemy.commander ? 690 : stats.range;
		if (distance(enemy, target) > range) { enemy.x += Math.cos(enemy.angle) * dt * stats.speed; enemy.y += Math.sin(enemy.angle) * dt * stats.speed; }
		enemy.cooldown -= dt;
		if (enemy.cooldown <= 0 && distance(enemy, target) < range + 50 && Math.abs(angleDelta(enemy.angle, targetAngle)) < 0.3) {
			if (enemy.kind === 'siege') {
				commitBarrage(state, enemy, target);
			} else launchEnemy(state, enemy, enemy.angle, stats.damage * difficulty.enemyDamage);
			enemy.cooldown = stats.reload;
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
				const speed = Math.hypot(shot.vx, shot.vy);
				shot.vx = Math.cos(angle) * speed; shot.vy = Math.sin(angle) * speed;
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
			const hits = state.enemies.filter(function (enemy) { return enemy.hp > 0 && !shot.hitIds?.includes(enemy.id); }).map(function (enemy) { return { enemy, entry: hitFraction(origin, shot, enemy, 25) }; }).filter(function (candidate): candidate is { enemy: Unit; entry: number } { return candidate.entry !== undefined; }).sort(function (a, b) { return a.entry - b.entry || a.enemy.id - b.enemy.id; });
			for (const hit of hits) {
				hurtEnemy(state, hit.enemy, shot.damage, origin);
				// Hit rate counts projectiles, not each victim of a penetrating bolt.
				if (!shot.hitIds || shot.hitIds.length === 0) state.stats.shotsHit++;
				if (shot.hitIds) shot.hitIds.push(hit.enemy.id); else shot.life = 0;
				const impact = { x: origin.x + (shot.x - origin.x) * hit.entry, y: origin.y + (shot.y - origin.y) * hit.entry };
				if (shot.splash) {
					for (const nearby of state.enemies) {
						if (nearby.id !== hit.enemy.id && nearby.hp > 0 && distance(nearby, impact) < shot.splash) hurtEnemy(state, nearby, shot.damage * 0.6, impact);
					}
				}
				burst(state, impact, shot.splash ?? (shot.kind === 'ppc' ? 55 : shot.kind === 'cannon' ? 45 : 20), shot.kind === 'ppc' ? '#b1a0ff' : '#ffd28b');
				if (shot.kind !== 'bullet') state.shake = Math.max(state.shake, 2);
				state.events.push('impact');
				if (!shot.hitIds) break;
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
	else if (prepareRequisition(state)) { /* Requisitions freeze incoming ordnance and preserve momentum. */ }
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
