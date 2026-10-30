import { advanceInterdiction, arrivalOutsideField, circleHit, enemyClearance, fieldBlocks, fieldRelative, INTERDICTION_CONFIG, navigateField, type Detour } from './interdiction';
import { canAcquire, contactIntel, SENSOR_CONFIG } from './sensors';
import { ESCORT_DRILL, SYSTEMS_TRIAL, type Scenario } from './scenarios';
import { absorbShieldDamage, advanceSystems, createSystems, POWER_CHANNELS, POWER_PRESETS, powerOutputs, REACTOR_UNITS, type Allocation, type PowerChannel, type SystemsState } from './systems';
export type Point = { x: number; y: number };
export type Weapon = 'flak' | 'rail' | 'missile';
export type EnemyKind = 'raider' | 'bomber' | 'armored' | 'flagship';
export type EscortKind = 'interceptor' | 'guardian';
export const MAX_HULL = 1200;
export const ROUTE_SECONDS = 210;
export const WAVE_INTERVAL = 34;
export const WAVE_COUNT = 6;
export const WEAPONS = {
	flak: { name: 'Flak', cost: 75, range: 255, damage: 13, reload: 0.32, speed: 650, description: 'Rapid fire. Shreds light raiders.' },
	rail: { name: 'Railgun', cost: 115, range: 440, damage: 95, reload: 2.2, speed: 1100, description: 'Long range. Pierces heavy armor.' },
	missile: { name: 'Missile', cost: 135, range: 355, damage: 52, reload: 1.8, speed: 300, description: 'Homing salvo. Blasts clustered ships.' },
};
export const ESCORTS = {
	interceptor: { name: 'Interceptor wing', cost: 85, count: 3, hp: 65, speed: 160, range: 155, damage: 10, reload: 0.65 },
	guardian: { name: 'Guardian', cost: 105, count: 1, hp: 260, speed: 85, range: 240, damage: 24, reload: 0.9 },
};
const ENEMIES = {
	raider: { hp: 45, speed: 50, range: 100, damage: 7, reload: 1.2, reward: 9, armor: 1 },
	bomber: { hp: 95, speed: 30, range: 290, damage: 34, reload: 3.8, reward: 17, armor: 1 },
	armored: { hp: 260, speed: 24, range: 185, damage: 22, reload: 2.4, reward: 28, armor: 0.48 },
	flagship: { hp: 2400, speed: 14, range: 370, damage: 55, reload: 2.8, reward: 180, armor: 0.7 },
};
export interface Mount extends Point { weapon: Weapon | undefined; level: number; cooldown: number; aim: number }
export interface Enemy extends Point { interdictionSide?: { fieldId: number; side: -1 | 1 }; detour?: Detour; id: number; kind: EnemyKind; hp: number; maxHp: number; cooldown: number }
export interface Escort extends Point { wingId?: number; sector?: Sector; id: number; kind: EscortKind; hp: number; cooldown: number; angle: number }
export interface Shot extends Point { sensorDamage?: number; id: number; vx: number; vy: number; damage: number; side: 'player' | 'enemy'; weapon: Weapon | 'escort' | 'hostile'; target: number | undefined; life: number }
export interface Effect extends Point { sourceShot?: Shot; radius: number; life: number; maxLife: number; color: string }
export interface Arrival { at: number; kind: EnemyKind; x: number; y: number }
export const SECTORS = ['port', 'starboard', 'ahead', 'astern'] as const;
export type Sector = typeof SECTORS[number];
export const SECTOR_POINTS: Record<Sector, Point> = { port: { x: 0, y: -230 }, starboard: { x: 0, y: 230 }, ahead: { x: 280, y: 0 }, astern: { x: -280, y: 0 } };
export interface Wing { id: number; phase: 'ready' | 'launching' | 'sortie' | 'returning' | 'rearming'; timer: number; craft: Escort[]; assignment: Sector; }
export const WING_TIMING = { launch: 2, sortie: 18, rearm: 10 };
export interface State {
	systems: SystemsState;
	resultReason: 'hull' | 'deadline' | 'arrival' | undefined;
	scenario: Scenario | undefined; experimental: boolean; wings: Wing[]; launches: number; orders: number; escortLosses: number; coverageDegrees: number; paused: boolean; focused: boolean;
	time: number; hull: number; salvage: number; wave: number; nextWave: number; kills: number;
	status: 'fitting' | 'running' | 'won' | 'lost'; mounts: Mount[]; enemies: Enemy[]; escorts: Escort[];
	shots: Shot[]; effects: Effect[]; arrivals: Arrival[]; nextId: number;
	rally: Point; priority: number | undefined; pulseCooldown: number; aegisRemaining: number; repairCooldown: number;
	cleared: boolean; message: string; messageTime: number;
}
export const distance = function (a: Point, b: Point): number { return Math.hypot(a.x - b.x, a.y - b.y); };
export const createState = function (options: { coverageDegrees?: number; experimental?: boolean; scenario?: 'drill' | 'systems' } = {}): State {
	const scenario = options.scenario === 'systems' ? SYSTEMS_TRIAL : options.scenario === 'drill' ? ESCORT_DRILL : undefined;
	return {
		resultReason: undefined,
		systems: createSystems((scenario?.duration ?? ROUTE_SECONDS) * powerOutputs(POWER_PRESETS.balanced).speed),
		scenario, experimental: scenario !== undefined || (options.experimental ?? false), wings: [], launches: 0, orders: 0, escortLosses: 0, coverageDegrees: options.coverageDegrees ?? (scenario ? 240 : 360), paused: false, focused: true,
		time: 0, hull: MAX_HULL, salvage: scenario?.salvage ?? 300, wave: 0, nextWave: scenario ? (scenario.encounters[0]?.at ?? Infinity) : 5, kills: 0, status: 'fitting',
		mounts: [-1, 1].flatMap(function (side) { return [-96, -32, 32, 96].map(function (x): Mount { return { x, y: side * 43, weapon: undefined, level: 0, cooldown: 0, aim: side * Math.PI / 2 }; }); }),
		enemies: [], escorts: [], shots: [], effects: [], arrivals: [], nextId: 1, rally: { x: 0, y: 0 }, priority: undefined,
		pulseCooldown: 0, aegisRemaining: 0, repairCooldown: 0, cleared: false, message: 'Fit your ship, then depart. Weapons fire automatically.', messageTime: 8,
	};
};
export const notify = function (state: State, message: string) { state.message = message; state.messageTime = 4; };
const canOrder = function (state: State) { return !state.paused && state.focused && (state.status === 'fitting' || state.status === 'running'); };
export const interdictionReason = function (state: State, point?: Point): string {
	const interdiction = state.systems.interdiction;
	if (!canOrder(state)) return state.paused ? 'Paused' : !state.focused ? 'Command link unfocused' : 'Run ended';
	if (state.status !== 'running') return 'Depart first';
	if (interdiction.field) return 'One field already active';
	if (interdiction.cooldown > 0) return `Field cooling down: ${Math.ceil(interdiction.cooldown)}s`;
	if (state.salvage < INTERDICTION_CONFIG.cost) return `Need ${INTERDICTION_CONFIG.cost} salvage`;
	if (!point) return '';
	if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return 'Choose a valid point';
	if (point.x < INTERDICTION_CONFIG.minRelativeX || Math.hypot(point.x, point.y) > INTERDICTION_CONFIG.maxRange) return 'Place ahead or beside the ark, within 450m';
	const fromHull = Math.hypot(Math.max(0, Math.abs(point.x) - 145), Math.max(0, Math.abs(point.y) - 40));
	if (fromHull <= INTERDICTION_CONFIG.radius + INTERDICTION_CONFIG.minArkClearance) return 'Field must clear the ark hull';
	if (state.enemies.some(function (enemy) { return enemy.hp > 0 && distance(point, enemy) <= enemyClearance(enemy); })) return 'Field must clear hostile ships';
	return '';
};
export const placeInterdiction = function (state: State, point: Point): boolean {
	if (interdictionReason(state, point)) return false;
	const systems = state.systems;
	state.salvage -= INTERDICTION_CONFIG.cost;
	systems.interdiction.field = { id: state.nextId++, world: { x: systems.distanceTraveled + point.x, y: point.y }, remaining: INTERDICTION_CONFIG.lifetime };
	systems.interdiction.cooldown = INTERDICTION_CONFIG.cooldown; systems.interdiction.placements++;
	notify(state, 'Interdiction deployed. Hostile approaches and rounds are blocked.');
	return true;
};
export const setAllocation = function (state: State, allocation: Readonly<Allocation>): boolean {
	const systems = state.systems;
	if (!canOrder(state)) return false;
	if (!POWER_CHANNELS.every(function (channel) { return Number.isInteger(allocation[channel]) && allocation[channel] >= 0; })) return false;
	if (POWER_CHANNELS.reduce(function (sum, channel) { return sum + allocation[channel]; }, 0) !== REACTOR_UNITS) return false;
	if (POWER_CHANNELS.every(function (channel) { return systems.allocation[channel] === allocation[channel]; })) return false;
	systems.allocation = { engines: allocation.engines, weapons: allocation.weapons, shields: allocation.shields };
	systems.powerChanges++;
	return true;
};
export const transferPower = function (state: State, from: PowerChannel, to: PowerChannel): boolean {
	if (from === to || !POWER_CHANNELS.includes(from) || !POWER_CHANNELS.includes(to)) return false;
	const allocation = state.systems.allocation;
	return setAllocation(state, { ...allocation, [from]: allocation[from] - 1, [to]: allocation[to] + 1 });
};
export const build = function (state: State, index: number, weapon: Weapon): boolean {
	const mount = state.mounts[index]; const config = WEAPONS[weapon];
	if (!canOrder(state) || !mount || mount.weapon || state.salvage < config.cost) return false;
	state.salvage -= config.cost; mount.weapon = weapon; mount.level = 1; mount.cooldown = 0;
	return true;
};
export const upgradeCost = function (mount: Mount): number { return mount.weapon ? Math.round(WEAPONS[mount.weapon].cost * (mount.level === 1 ? 0.8 : 1.2)) : 0; };
export const upgrade = function (state: State, index: number): boolean {
	const mount = state.mounts[index];
	if (!canOrder(state) || !mount?.weapon || mount.level >= 3 || state.salvage < upgradeCost(mount)) return false;
	state.salvage -= upgradeCost(mount); mount.level += 1; return true;
};
export const coverageFor = function (state: State, mount: Mount) {
	return { range: mount.weapon ? WEAPONS[mount.weapon].range * (1 + (mount.level - 1) * 0.12) : 0,
		center: mount.y < 0 ? -Math.PI / 2 : Math.PI / 2, arc: state.coverageDegrees * Math.PI / 180 };
};
export const covered = function (state: State, mount: Mount, target: Point): boolean {
	const { range, center, arc } = coverageFor(state, mount);
	const angle = Math.atan2(target.y - mount.y, target.x - mount.x) - center;
	return distance(mount, target) <= range + 1e-8 && Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= arc / 2 + 1e-8;
};
export const invested = function (mount: Mount): number {
	return mount.weapon ? WEAPONS[mount.weapon].cost + (mount.level >= 2 ? Math.round(WEAPONS[mount.weapon].cost * 0.8) : 0) + (mount.level >= 3 ? Math.round(WEAPONS[mount.weapon].cost * 1.2) : 0) : 0;
};
export const sell = function (state: State, index: number): boolean {
	const mount = state.mounts[index]; if (!canOrder(state) || !mount?.weapon) return false;
	state.salvage += Math.floor(invested(mount) * 0.7); mount.weapon = undefined; mount.level = 0; return true;
};
export const deploy = function (state: State, kind: EscortKind): boolean {
	const config = ESCORTS[kind];
	if (!canOrder(state) || state.salvage < config.cost || craftCount(state) + config.count > 9) return false;
	state.salvage -= config.cost;
	if (state.experimental && kind === 'interceptor') {
		const wing: Wing = { id: state.nextId++, phase: 'ready', timer: 0, craft: [], assignment: 'port' };
		wing.craft = Array.from({ length: 3 }, function () { return makeFighter(state, wing.id); }); state.wings.push(wing); return true;
	}
	for (let i = 0; i < config.count; i++) state.escorts.push({ id: state.nextId++, kind, ...(state.experimental && kind === 'guardian' ? { sector: 'port' as const } : {}), x: -110, y: (i - 1) * 18, hp: config.hp, cooldown: i * 0.1, angle: 0 });
	return true;
};
export const craftCount = function (state: State): number {
	return state.escorts.length + state.wings.filter(function (w) { return w.phase === 'ready' || w.phase === 'rearming'; }).reduce(function (n, w) { return n + w.craft.length; }, 0);
};
const makeFighter = function (state: State, wingId: number): Escort {
	return { id: state.nextId++, wingId, kind: 'interceptor', x: -110, y: 0, hp: ESCORTS.interceptor.hp, cooldown: 0, angle: Math.PI };
};
export const scrambleReason = function (state: State, wing: Wing): string {
	if (!canOrder(state)) return state.paused ? 'Paused' : !state.focused ? 'Command link unfocused' : 'Run ended';
	if (state.status !== 'running') return 'Depart first';
	if (wing.phase !== 'ready') return wing.phase;
	return wing.craft.length ? '' : 'Replace lost fighters';
};
export const scramble = function (state: State, id: number, sector: Sector): boolean {
	const wing = state.wings.find(function (w) { return w.id === id; });
	if (!wing || scrambleReason(state, wing)) return false;
	wing.assignment = sector; wing.phase = 'launching'; wing.timer = WING_TIMING.launch;
	for (const [i, craft] of wing.craft.entries()) { craft.x = -110; craft.y = (i - 1) * 18; state.escorts.push(craft); }
	state.launches++; state.orders++; return true;
};
export const replaceFighters = function (state: State, id: number): boolean {
	const wing = state.wings.find(function (w) { return w.id === id; });
	if (!canOrder(state) || !wing || wing.phase !== 'ready' || wing.craft.length >= 3) return false;
	const count = 3 - wing.craft.length; const cost = count * 30;
	if (state.salvage < cost || craftCount(state) + count > 9) return false;
	state.salvage -= cost;
	for (let i = 0; i < count; i++) wing.craft.push(makeFighter(state, id));
	return true;
};
const updateWings = function (state: State, dt: number) {
	for (const wing of state.wings) {
		wing.craft = wing.craft.filter(function (craft) { return craft.hp > 0; });
		if (wing.phase === 'ready') continue;
		wing.timer = Math.max(0, wing.timer - dt);
		if (wing.phase === 'launching' && wing.timer === 0) { wing.phase = 'sortie'; wing.timer = WING_TIMING.sortie; }
		else if (wing.phase === 'sortie' && (wing.timer === 0 || wing.craft.length === 0)) wing.phase = 'returning';
		else if (wing.phase === 'returning' && wing.craft.every(function (craft) { return distance(craft, { x: -110, y: 0 }) < 8; })) {
			state.escorts = state.escorts.filter(function (craft) { return craft.wingId !== wing.id; }); wing.phase = 'rearming'; wing.timer = WING_TIMING.rearm;
		} else if (wing.phase === 'rearming' && wing.timer === 0) wing.phase = 'ready';
	}
};
export const assignGuardian = function (state: State, id: number, sector: Sector): boolean {
	const guardian = state.escorts.find(function (e) { return e.id === id && e.kind === 'guardian' && e.hp > 0; });
	if (!canOrder(state) || !state.experimental || !guardian || guardian.sector === sector) return false;
	guardian.sector = sector; state.orders++; return true;
};
export const repair = function (state: State): boolean {
	if (!canOrder(state) || state.salvage < 80 || state.hull >= MAX_HULL || state.repairCooldown > 0) return false;
	state.salvage -= 80; state.hull = Math.min(MAX_HULL, state.hull + 240); state.repairCooldown = 15; notify(state, 'Repair crews restored 240 hull.'); return true;
};
export const repairSensors = function (state: State): boolean {
	const sensors = state.systems.sensors;
	if (!canOrder(state) || state.salvage < SENSOR_CONFIG.repairCost || sensors.integrity >= SENSOR_CONFIG.maxIntegrity || sensors.repairCooldown > 0) return false;
	state.salvage -= SENSOR_CONFIG.repairCost;
	sensors.integrity = SENSOR_CONFIG.maxIntegrity; sensors.repairCooldown = SENSOR_CONFIG.repairCooldown; sensors.repairs++;
	notify(state, 'Sensors restored to 100%. Advance warning and acquisition restored.');
	return true;
};
export const setPriority = function (state: State, id: number | undefined): boolean {
	if (!canOrder(state)) return false;
	if (id !== undefined && !state.enemies.some(function (enemy) { return enemy.id === id && enemy.hp > 0 && canAcquire(state, enemy); })) return false;
	state.priority = id;
	return true;
};
const clearLostPriority = function (state: State) {
	if (state.priority !== undefined && !state.enemies.some(function (enemy) { return enemy.id === state.priority && enemy.hp > 0 && canAcquire(state, enemy); })) state.priority = undefined;
};
export const pulse = function (state: State): boolean {
	if (!canOrder(state) || state.status !== 'running' || state.pulseCooldown > 0) return false;
	state.pulseCooldown = 32; state.aegisRemaining = 5; state.shots = state.shots.filter(function (shot) { return shot.side !== 'enemy'; });
	state.effects.push({ x: 0, y: 0, radius: 310, life: 0.8, maxLife: 0.8, color: '#88f1e4' });
	for (const enemy of state.enemies) {
		const d = distance(enemy, { x: 0, y: 0 });
		if (d < 310) { enemy.hp -= 45; const angle = Math.atan2(enemy.y, enemy.x); enemy.x += Math.cos(angle) * 75; enemy.y += Math.sin(angle) * 75; }
	}
	notify(state, 'AEGIS: incoming rounds cleared. 80% hull protection for 5 seconds.'); return true;
};
export const WAVE_NAMES = ['Scouting party', 'Bomber screen', 'Ironclad advance', 'Crossfire', 'The swarm', 'The gatekeeper'];
export const waveSide = function (wave: number): string { return ['PORT', 'STARBOARD', 'BOW', 'BOTH FLANKS', 'ASTERN', 'BOW + FLANKS'][(wave - 1) % 6] ?? 'UNKNOWN'; };
const waveArrivals = function (wave: number, at: number): Arrival[] {
	const count = [8, 11, 10, 17, 24, 16][wave - 1] ?? 16;
	return Array.from({ length: count }, function (_, i) {
		const base = wave === 1 ? -Math.PI / 2 : wave === 2 ? Math.PI / 2 : wave === 3 ? 0 : wave === 5 ? Math.PI : i % 2 === 0 ? -Math.PI / 2 : Math.PI / 2;
		const angle = base + Math.sin(i * 2.4) * 0.65;
		const kind: EnemyKind = wave === 6 && i === 0 ? 'flagship' : wave >= 3 && i % 5 === 0 ? 'armored' : wave >= 2 && i % 3 === 0 ? 'bomber' : 'raider';
		const arrivalAngle = kind === 'flagship' ? 0 : angle;
		return { at: at + i * (wave === 5 ? 0.45 : 0.9), kind, x: Math.cos(arrivalAngle) * 620, y: Math.sin(arrivalAngle) * 520 };
	});
};
const startWave = function (state: State) {
	state.wave += 1; state.nextWave += WAVE_INTERVAL; state.cleared = false;
	state.arrivals.push(...waveArrivals(state.wave, state.time));
};
const startEncounter = function (state: State) {
	const encounter = state.scenario?.encounters[state.wave]; if (!encounter) return;
	state.wave++; state.cleared = false; state.nextWave = state.scenario?.encounters[state.wave]?.at ?? Infinity;
	const base = SECTOR_POINTS[encounter.sector]; const angle = Math.atan2(base.y, base.x);
	for (let i = 0; i < encounter.count; i++) {
		const bearing = angle + Math.sin(i * 2.4) * 0.35;
		state.arrivals.push({ at: encounter.at + i * encounter.spacing, kind: encounter.kind, x: Math.cos(bearing) * 520, y: Math.sin(bearing) * 460 });
	}
};
export const durationFor = function (state: State): number { return state.scenario?.duration ?? ROUTE_SECONDS; };
const contactDirection = function (point: Point): string {
	return Math.abs(point.x) > Math.abs(point.y) ? point.x > 0 ? 'AHEAD' : 'ASTERN' : point.y > 0 ? 'STARBOARD' : 'PORT';
};
export const contactWarning = function (state: State): string {
	const next = state.scenario?.encounters[state.wave];
	if (next) {
		const bearing = SECTOR_POINTS[next.sector]; const angle = Math.atan2(bearing.y, bearing.x);
		const range = Math.hypot(Math.cos(angle) * 520, Math.sin(angle) * 460) + ENEMIES[next.kind].speed * Math.max(0, next.at - state.time);
		const intel = contactIntel(state, { x: Math.cos(angle) * range, y: Math.sin(angle) * range });
		if (intel === 'classified') return `${next.sector.toUpperCase()} · ${next.count} ${next.kind} · arrival ${Math.max(0, Math.ceil(next.at - state.time))}s`;
		if (intel === 'detected') return `${next.sector.toUpperCase()} · unclassified contact`;
	}
	const futureWave = !state.scenario && state.wave < WAVE_COUNT && Number.isFinite(state.nextWave) ? waveArrivals(state.wave + 1, state.nextWave) : [];
	for (const arrival of [...state.arrivals, ...futureWave]) {
		const radius = Math.hypot(arrival.x, arrival.y);
		const range = radius + ENEMIES[arrival.kind].speed * Math.max(0, arrival.at - state.time);
		const intel = contactIntel(state, { x: arrival.x * range / radius, y: arrival.y * range / radius });
		if (intel === 'classified') return `${contactDirection(arrival)} · ${arrival.kind} · arrival ${Math.max(0, Math.ceil(arrival.at - state.time))}s`;
		if (intel === 'detected') return `${contactDirection(arrival)} · unclassified contact`;
	}
	const contacts = state.enemies.filter(function (enemy) { return enemy.hp > 0 && canAcquire(state, enemy); });
	const contact = contacts[0];
	if (!contact) return 'Scanning for contacts';
	if (contactIntel(state, contact) === 'detected') return `${contactDirection(contact)} · unclassified contact`;
	const count = contacts.filter(function (enemy) { return enemy.kind === contact.kind && contactDirection(enemy) === contactDirection(contact) && contactIntel(state, enemy) === 'classified'; }).length;
	return `${contactDirection(contact)} · ${count} ${contact.kind} · in range`;
};
const effect = function (state: State, point: Point, radius: number, color: string, sourceShot?: Shot) {
	state.effects.push({ x: point.x, y: point.y, radius, life: 0.45, maxLife: 0.45, color, ...(sourceShot ? { sourceShot: { ...sourceShot } } : {}) });
};
const fire = function (state: State, from: Point, to: Point, damage: number, speed: number, side: Shot['side'], weapon: Shot['weapon'], target: number | undefined, sensorDamage?: number) {
	const angle = Math.atan2(to.y - from.y, to.x - from.x);
	state.shots.push({ id: state.nextId++, x: from.x, y: from.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, damage, side, weapon, target, life: 4, ...(sensorDamage === undefined ? {} : { sensorDamage }) });
};
const nearest = function <T extends Point>(from: Point, targets: readonly T[], range: number): T | undefined {
	let best: T | undefined; let closest = range;
	for (const target of targets) { const d = distance(from, target); if (d <= closest) { best = target; closest = d; } }
	return best;
};
const targetFor = function (state: State, from: Point, range: number): Enemy | undefined {
	const priority = state.enemies.find(function (enemy) { return enemy.id === state.priority && enemy.hp > 0 && distance(from, enemy) <= range; });
	return priority ?? nearest(from, state.enemies.filter(function (enemy) { return enemy.hp > 0; }), range);
};
const moveToward = function (point: Point, target: Point, speed: number, dt: number) {
	const d = distance(point, target); if (d <= 1) return;
	const travel = Math.min(speed * dt, d); point.x += (target.x - point.x) / d * travel; point.y += (target.y - point.y) / d * travel;
};
const damageEnemy = function (enemy: Enemy, damage: number, weapon: Shot['weapon']) { enemy.hp -= damage * (weapon === 'rail' ? 1 : ENEMIES[enemy.kind].armor); };
const segmentDistance = function (point: Point, a: Point, b: Point): number {
	const dx = b.x - a.x; const dy = b.y - a.y; const length = dx * dx + dy * dy;
	const t = length > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
	return distance(point, { x: a.x + dx * t, y: a.y + dy * t });
};
export const step = function (state: State, dt: number) {
	if (!canOrder(state) || state.status !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
	// The deadline is strict: the tick ending exactly there loses, even if it clears combat.
	const deadline = state.scenario?.deadline;
	if (deadline !== undefined && state.time >= deadline) { state.status = 'lost'; state.resultReason = state.hull <= 0 ? 'hull' : 'deadline'; state.shots = []; return; }
	dt = Math.min(dt, 0.05, deadline === undefined ? Infinity : Math.max(0, deadline - state.time)); state.time += dt;
	state.pulseCooldown = Math.max(0, state.pulseCooldown - dt); state.aegisRemaining = Math.max(0, state.aegisRemaining - dt); state.repairCooldown = Math.max(0, state.repairCooldown - dt); state.messageTime = Math.max(0, state.messageTime - dt);
	const distanceBefore = state.systems.distanceTraveled;
	state.systems.sensors.repairCooldown = Math.max(0, state.systems.sensors.repairCooldown - dt);
	state.systems.shield.hitFlash = Math.max(0, state.systems.shield.hitFlash - dt);
	state.systems.distanceTraveled = Math.min(state.systems.routeLength, state.systems.distanceTraveled + powerOutputs(state.systems.allocation).speed * dt);
	const fieldDrift = (state.systems.distanceTraveled) - distanceBefore;
	advanceInterdiction(state, dt);
	// The reactor provides a modest income even while enemies remain outside firing range.
	state.salvage += dt * 1.2;
	if (state.time >= state.nextWave) { if (state.scenario) startEncounter(state); else if (state.wave < WAVE_COUNT) startWave(state); }
	for (const arrival of state.arrivals.filter(function (a) { return a.at <= state.time; })) {
		const config = ENEMIES[arrival.kind]; const position = arrivalOutsideField(state, arrival, arrival.kind); state.enemies.push({ id: state.nextId++, kind: arrival.kind, x: position.x, y: position.y, hp: config.hp, maxHp: config.hp, cooldown: 0.8 });
	}
	state.arrivals = state.arrivals.filter(function (a) { return a.at > state.time; });
	clearLostPriority(state);
	const weaponRate = powerOutputs(state.systems.allocation).weaponRate;
	for (const mount of state.mounts) {
		mount.cooldown = Math.max(0, mount.cooldown - dt * weaponRate);
		if (!mount.weapon || weaponRate === 0) continue;
		const config = WEAPONS[mount.weapon]; const candidates = state.enemies.filter(function (enemy) { return enemy.hp > 0 && canAcquire(state, enemy) && covered(state, mount, enemy); });
		const target = candidates.find(function (enemy) { return enemy.id === state.priority; }) ?? nearest(mount, candidates, coverageFor(state, mount).range);
		if (!target) continue;
		mount.aim = Math.atan2(target.y - mount.y, target.x - mount.x);
		if (mount.cooldown <= 0) { fire(state, mount, target, config.damage * (1 + (mount.level - 1) * 0.55), config.speed, 'player', mount.weapon, target.id); mount.cooldown = config.reload / (1 + (mount.level - 1) * 0.12); }
	}
	updateWings(state, dt);
	for (const [i, escort] of state.escorts.entries()) {
		if (escort.hp <= 0) continue;
		const config = ESCORTS[escort.kind]; escort.cooldown -= dt;
		const wing = state.wings.find(function (w) { return w.id === escort.wingId; });
		if (wing && wing.phase !== 'sortie') {
			const destination = wing.phase === 'launching' ? SECTOR_POINTS[wing.assignment] : { x: -110, y: 0 };
			escort.angle = Math.atan2(destination.y - escort.y, destination.x - escort.x); moveToward(escort, destination, config.speed, dt); continue;
		}
		const formation = escort.sector ? SECTOR_POINTS[escort.sector] : wing ? SECTOR_POINTS[wing.assignment] : { x: state.rally.x + Math.cos(i * 2.4) * 45, y: state.rally.y + Math.sin(i * 2.4) * 45 };
		const target = wing || escort.sector ? nearest(escort, state.enemies.filter(function (e) { return e.hp > 0 && distance(e, formation) <= 180; }), 300) : targetFor(state, escort, 300);
		const destination = target && distance(target, formation) < 320 ? target : formation;
		const standOff = destination === target ? config.range * 0.75 : 5;
		if (distance(escort, destination) > standOff) moveToward(escort, destination, config.speed, dt);
		escort.angle = Math.atan2(destination.y - escort.y, destination.x - escort.x);
		if (target && distance(escort, target) <= config.range && escort.cooldown <= 0) { fire(state, escort, target, config.damage, 550, 'player', 'escort', target.id); escort.cooldown = config.reload; }
	}
	for (const enemy of state.enemies) {
		if (enemy.hp <= 0) continue;
		const config = ENEMIES[enemy.kind]; enemy.cooldown -= dt;
		const escort = nearest(enemy, state.escorts.filter(function (e) { return e.hp > 0; }), 180);
		const destination = escort ?? { x: Math.max(-110, Math.min(110, enemy.x)), y: Math.max(-30, Math.min(30, enemy.y)) };
		const detouring = navigateField(state, enemy, destination, config.speed, dt, fieldDrift, distance(enemy, destination) > config.range * 0.85);
		if (!detouring && distance(enemy, destination) > config.range * 0.85) moveToward(enemy, destination, config.speed, dt);
		if (enemy.cooldown <= 0 && distance(enemy, destination) <= config.range && !fieldBlocks(state, enemy, destination)) {
			fire(state, enemy, destination, config.damage, enemy.kind === 'bomber' ? 155 : 235, 'enemy', 'hostile', escort?.id, enemy.kind === 'bomber' ? SENSOR_CONFIG.damagePerBomberHit : undefined); enemy.cooldown = config.reload;
		}
	}
	let arkHit = false;
	for (const shot of state.shots) {
		const before = { x: shot.x, y: shot.y }; shot.life -= dt;
		if (shot.weapon === 'missile') {
			const target = state.enemies.find(function (e) { return e.id === shot.target && e.hp > 0 && canAcquire(state, e); });
			if (target) { const angle = Math.atan2(target.y - shot.y, target.x - shot.x); shot.vx = Math.cos(angle) * 300; shot.vy = Math.sin(angle) * 300; }
		}
		shot.x += shot.vx * dt; shot.y += shot.vy * dt;
		if (shot.side === 'player') {
			const hit = state.enemies.find(function (enemy) { return enemy.hp > 0 && segmentDistance(enemy, before, shot) < (enemy.kind === 'flagship' ? 38 : enemy.kind === 'armored' ? 23 : 15); });
			if (!hit) continue;
			shot.life = 0;
			if (shot.weapon === 'missile') { for (const enemy of state.enemies) if (distance(hit, enemy) < 85) damageEnemy(enemy, shot.damage, shot.weapon); effect(state, hit, 85, '#f9c875'); }
			else { damageEnemy(hit, shot.damage, shot.weapon); effect(state, hit, 10, '#a6efe5'); }
		} else {
			const center = fieldRelative(state);
			const blocked = center ? circleHit({ x: before.x - fieldDrift, y: before.y }, shot, center, INTERDICTION_CONFIG.radius) : undefined;
			if (blocked) {
				effect(state, blocked, 20, '#d7bf89', shot); shot.life = 0; state.systems.interdiction.blockedShots++; continue;
			}
			const hit = state.escorts.find(function (escort) { return escort.hp > 0 && segmentDistance(escort, before, shot) < (escort.kind === 'guardian' ? 20 : 12); });
			if (hit) { hit.hp -= shot.damage; shot.life = 0; effect(state, hit, 15, '#ff897e'); }
			else if (Math.abs(shot.x) < 145 && Math.abs(shot.y) < 40) {
				const overflow = absorbShieldDamage(state.systems, shot.damage);
				// Escort interception consumed its round above. Only shield overflow disrupts sensors;
				// Aegis mitigates hull damage below, not the subsystem disruption.
				if (overflow > 0 && shot.sensorDamage !== undefined && Number.isFinite(shot.sensorDamage) && shot.sensorDamage > 0) {
					const sensors = state.systems.sensors; const beforeIntegrity = sensors.integrity;
					sensors.integrity = Math.max(0, sensors.integrity - Math.min(SENSOR_CONFIG.damagePerBomberHit, shot.sensorDamage) * overflow / shot.damage);
					if (beforeIntegrity >= SENSOR_CONFIG.healthyThreshold && sensors.integrity < SENSOR_CONFIG.healthyThreshold) sensors.impairments++;
					clearLostPriority(state);
					notify(state, sensors.integrity === 0 ? 'Array-seeking round penetrated: sensors offline. Local defense active. Repair sensors.' : 'Array-seeking round penetrated: sensor integrity damaged. Repair sensors.');
				}
				state.hull = Math.max(0, state.hull - overflow * (state.aegisRemaining > 0 ? 0.2 : 1));
				arkHit ||= shot.damage > 0;
				shot.life = 0; effect(state, shot, 22, '#ff897e');
			}
		}
	}
	advanceSystems(state.systems, dt, arkHit);
	for (const enemy of state.enemies) if (enemy.hp <= 0) { state.salvage += ENEMIES[enemy.kind].reward; state.kills += 1; effect(state, enemy, enemy.kind === 'flagship' ? 120 : 35, '#ffb87b'); }
	for (const escort of state.escorts) if (escort.hp <= 0) { state.escortLosses++; effect(state, escort, 25, '#81cfe7'); }
	state.enemies = state.enemies.filter(function (e) { return e.hp > 0; }); state.escorts = state.escorts.filter(function (e) { return e.hp > 0; }); state.shots = state.shots.filter(function (s) { return s.life > 0; });
	for (const wing of state.wings) wing.craft = wing.craft.filter(function (craft) { return craft.hp > 0; });
	state.effects = state.effects.filter(function (e) { e.life -= dt; return e.life > 0; });
	clearLostPriority(state);
	if (state.hull > 0 && state.wave > 0 && !state.cleared && state.enemies.length === 0 && state.arrivals.length === 0) {
		state.cleared = true; state.salvage += 50; state.hull = Math.min(MAX_HULL, state.hull + 60); notify(state, 'Sector secured. +50 salvage · +60 hull. Refit for the next contact.');
	}
	if (state.hull <= 0) { state.status = 'lost'; state.resultReason = 'hull'; state.shots = []; }
	else if (deadline !== undefined && state.time >= deadline) { state.status = 'lost'; state.resultReason = 'deadline'; state.shots = []; }
	else {
		const combatResolved = state.wave === (state.scenario?.encounters.length ?? WAVE_COUNT) && state.enemies.length === 0 && state.arrivals.length === 0;
		const complete = (deadline !== undefined || state.time >= durationFor(state)) && state.systems.distanceTraveled >= state.systems.routeLength && combatResolved;
		if (complete) { state.status = 'won'; state.resultReason = 'arrival'; state.shots = []; }
	}
};
