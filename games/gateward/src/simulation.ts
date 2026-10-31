import { craftTurretSolution, hasCraftTurrets, type CraftAim } from './craft-turrets';
import { advanceInterdiction, arrivalOutsideField, circleHit, enemyClearance, fieldBlocks, INTERDICTION_CONFIG, navigateField, type Detour } from './interdiction';
import { canAcquire, contactIntel, SENSOR_CONFIG } from './sensors';
import { ESCORT_DRILL, SYSTEMS_TRIAL, type Scenario } from './scenarios';
import { conditionMultiplier, effectiveOutputs, absorbShieldDamage, advanceSystems, createSystems, POWER_CHANNELS, POWER_PRESETS, powerOutputs, REACTOR_UNITS, type Allocation, type PowerChannel, type SystemsState } from './systems';
import { arriveCourse, capitalCourse, createFlight, fighterCourse, fly, isCapital, type Flight } from './flight';
import { arkVelocity, flightVelocity, localPoint, mountWorld, worldPoint } from './space';
export type Point = { x: number; y: number };
export type Weapon = 'flak' | 'rail' | 'missile' | 'beam';
export type EnemyKind = 'raider' | 'bomber' | 'armored' | 'flagship';
export type EscortKind = 'interceptor' | 'guardian';
export const MAX_HULL = 1200;
export const ROUTE_SECONDS = 210;
export const WAVE_INTERVAL = 28;
export const WAVE_COUNT = 6;
// Move the approach earlier while retaining the existing mission clocks.
export const APPROACH = { leadTime: 15, spawnRange: 2200, cruiseSpeed: 60 } as const;
const approachAt = function (combatAt: number): number { return Math.max(0, combatAt - APPROACH.leadTime); };
export const WEAPONS = {
	beam: { name: 'Beam', cost: 125, range: 300, damage: 48, reload: 0.4, speed: 0, rotationSpeed: Math.PI, description: 'Sustained instant damage. Armor reduces damage.' },
	flak: { name: 'Flak', cost: 75, range: 255, damage: 13, reload: 0.32, speed: 650, rotationSpeed: Math.PI * 2, description: 'Rapid fire. Prefers classified light raiders. Focus overrides.' },
	rail: { name: 'Railgun', cost: 115, range: 440, damage: 95, reload: 2.2, speed: 1100, rotationSpeed: Math.PI / 2, description: 'Pierces armor. Prefers classified armored ships and flagships. Focus overrides.' },
	missile: { name: 'Missile', cost: 135, range: 355, damage: 52, reload: 1.8, speed: 300, rotationSpeed: Math.PI * 2 / 3, description: 'Homing splash. Prefers detected clusters within 85m. Focus overrides.' },
};
export const ESCORTS = {
	interceptor: { name: 'Interceptor wing', cost: 85, count: 3, hp: 65, speed: 160, range: 155, damage: 10, reload: 0.65 },
	guardian: { name: 'Guardian', cost: 105, count: 1, hp: 260, speed: 85, range: 240, damage: 24, reload: 0.9 },
};
export const ENEMIES = {
	raider: { hp: 45, speed: 50, range: 100, damage: 7, reload: 1.2, reward: 9, armor: 1 },
	bomber: { hp: 95, speed: 30, range: 290, damage: 34, reload: 3.8, reward: 17, armor: 1 },
	armored: { hp: 260, speed: 40, range: 185, damage: 22, reload: 2.4, reward: 28, armor: 0.48 },
	flagship: { hp: 2400, speed: 36, range: 370, damage: 55, reload: 2.8, reward: 180, armor: 0.7 },
};
export interface Mount extends Point { integrity: number; weapon: Weapon | undefined; level: number; cooldown: number; aim: number }
export const BOMBER_ATTACK = { windup: 2, releaseCue: 0.35 } as const;
export type BomberAttack = { phase: 'windup'; remaining: number; target: number | undefined } | { phase: 'released'; remaining: number };
export interface Enemy extends Point { subsystemTarget?: string; approaching?: boolean; bomberAttack?: BomberAttack; turretAim?: CraftAim; flight?: Flight; interdictionSide?: { fieldId: number; side: -1 | 1 }; detour?: Detour; id: number; kind: EnemyKind; hp: number; maxHp: number; cooldown: number }
export interface Escort extends Point { turretAim?: CraftAim; flight?: Flight; wingId?: number; sector?: Sector; id: number; kind: EscortKind; hp: number; cooldown: number; angle: number }
export interface Shot extends Point { originHeight?: number; origin?: Point; sourceVelocity?: Point; beamFrom?: Point; sensorDamage?: number; id: number; vx: number; vy: number; damage: number; side: 'player' | 'enemy'; weapon: Weapon | 'escort' | 'hostile'; target: number | undefined; life: number }
export type CombatFeedback =
	| { kind: 'muzzle'; mount: number; weapon: Weapon; aim: number }
	| { kind: 'impact'; shield: number; armor: number; hull: number; deck: boolean }
	| { kind: 'destruction' };
export interface Effect extends Point { feedback?: CombatFeedback; sourceShot?: Shot; radius: number; life: number; maxLife: number; color: string }
export interface Arrival { at: number; kind: EnemyKind; x: number; y: number }
export const SECTORS = ['port', 'starboard', 'ahead', 'astern'] as const;
export type Sector = typeof SECTORS[number];
export const SECTOR_POINTS: Record<Sector, Point> = { port: { x: 0, y: -230 }, starboard: { x: 0, y: 230 }, ahead: { x: 280, y: 0 }, astern: { x: -280, y: 0 } };
export interface Wing { id: number; phase: 'ready' | 'launching' | 'sortie' | 'returning' | 'rearming'; timer: number; craft: Escort[]; assignment: Sector; }
export const WING_TIMING = { launch: 2, sortie: 18, rearm: 10 };
export interface State {
	repairs: Record<string, number>;
	ark: Point & { angle: number; speed: number };
	routeOrigin: Point;
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
export const MISSILE_SPLASH_RADIUS = 85;

// Scores use only available intel. Range and arc constrain the aim point;
// detected neighbours outside that mount's arc/range can still take splash.
export const mountTarget = function (state: State, mount: Mount): Enemy | undefined {
	const weapon = mount.weapon;
	if (!weapon) return undefined;
	const visible = state.enemies.filter(function (enemy) { return enemy.hp > 0 && canAcquire(state, enemy); });
	const candidates = visible.filter(function (enemy) { return covered(state, mount, enemy); });
	const priority = candidates.find(function (enemy) { return enemy.id === state.priority; });
	if (priority) return priority;
	const score = function (enemy: Enemy): number {
		if (weapon === 'missile') return visible.filter(function (other) { return other.id !== enemy.id && distance(enemy, other) < MISSILE_SPLASH_RADIUS; }).length;
		if (contactIntel(state, enemy) !== 'classified') return 0;
		return Number(weapon === 'flak' ? enemy.kind === 'raider' : weapon === 'rail' && (enemy.kind === 'armored' || enemy.kind === 'flagship'));
	};
	const origin = mountWorld(state, mount);
	return candidates.map(function (enemy) { return { enemy, score: score(enemy), distance: distance(origin, enemy) }; })
		.sort(function (a, b) { return b.score - a.score || a.distance - b.distance || a.enemy.id - b.enemy.id; })[0]?.enemy;
};
export const createState = function (options: { coverageDegrees?: number; experimental?: boolean; scenario?: 'drill' | 'systems' } = {}): State {
	const scenario = options.scenario === 'systems' ? SYSTEMS_TRIAL : options.scenario === 'drill' ? ESCORT_DRILL : undefined;
	return {
		repairs: {}, ark: { x: 0, y: 0, angle: 0, speed: 0 }, routeOrigin: { x: 0, y: 0 },
		resultReason: undefined,
		systems: createSystems((scenario?.duration ?? ROUTE_SECONDS) * powerOutputs(POWER_PRESETS.balanced).speed),
		scenario, experimental: scenario !== undefined || (options.experimental ?? false), wings: [], launches: 0, orders: 0, escortLosses: 0, coverageDegrees: options.coverageDegrees ?? (scenario ? 240 : 120), paused: false, focused: true,
		time: 0, hull: MAX_HULL, salvage: scenario?.salvage ?? 300, wave: 0, nextWave: scenario ? approachAt(scenario.encounters[0]?.at ?? Infinity) : 5, kills: 0, status: 'fitting',
		mounts: [-1, 1].flatMap(function (side) { return [-96, -32, 32, 96].map(function (x): Mount { return { integrity: 100, x, y: side * 43, weapon: undefined, level: 0, cooldown: 0, aim: side * Math.PI / 2 }; }); }),
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
	const local = localPoint(state, point);
	if (local.x < INTERDICTION_CONFIG.minRelativeX || Math.hypot(local.x, local.y) > INTERDICTION_CONFIG.maxRange) return 'Place ahead or beside the ark, within 450m';
	const fromHull = Math.hypot(Math.max(0, Math.abs(local.x) - 145), Math.max(0, Math.abs(local.y) - 40));
	if (fromHull <= INTERDICTION_CONFIG.radius + INTERDICTION_CONFIG.minArkClearance) return 'Field must clear the ark hull';
	if (state.enemies.some(function (enemy) { return enemy.hp > 0 && distance(point, enemy) <= enemyClearance(enemy); })) return 'Field must clear hostile ships';
	return '';
};
export const placeInterdiction = function (state: State, point: Point): boolean {
	if (interdictionReason(state, point)) return false;
	const systems = state.systems;
	state.salvage -= INTERDICTION_CONFIG.cost;
	systems.interdiction.field = { id: state.nextId++, world: { ...point }, remaining: INTERDICTION_CONFIG.lifetime };
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
	const local = localPoint(state, target);
	const angle = Math.atan2(local.y - mount.y, local.x - mount.x) - center;
	return distance(mount, local) <= range + 1e-8 && Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= arc / 2 + 1e-8;
};
export const invested = function (mount: Mount): number {
	return mount.weapon ? WEAPONS[mount.weapon].cost + (mount.level >= 2 ? Math.round(WEAPONS[mount.weapon].cost * 0.8) : 0) + (mount.level >= 3 ? Math.round(WEAPONS[mount.weapon].cost * 1.2) : 0) : 0;
};
export const sell = function (state: State, index: number): boolean {
	const mount = state.mounts[index]; if (!canOrder(state) || !mount?.weapon) return false;
	state.salvage += Math.floor(invested(mount) * 0.7); mount.weapon = undefined; mount.level = 0; delete state.repairs[`mount:${index}`]; return true;
};
export const deploy = function (state: State, kind: EscortKind): boolean {
	const config = ESCORTS[kind];
	if (!canOrder(state) || state.salvage < config.cost || craftCount(state) + config.count > 9) return false;
	state.salvage -= config.cost;
	if (state.experimental && kind === 'interceptor') {
		const wing: Wing = { id: state.nextId++, phase: 'ready', timer: 0, craft: [], assignment: 'port' };
		wing.craft = Array.from({ length: 3 }, function () { return makeFighter(state, wing.id); }); state.wings.push(wing); return true;
	}
	for (let i = 0; i < config.count; i++) state.escorts.push({ id: state.nextId++, kind, ...(state.experimental && kind === 'guardian' ? { sector: 'port' as const } : {}), ...worldPoint(state, { x: -110, y: (i - 1) * 18 }), hp: config.hp, cooldown: i * 0.1, angle: state.ark.angle });
	return true;
};
export const craftCount = function (state: State): number {
	return state.escorts.length + state.wings.filter(function (w) { return w.phase === 'ready' || w.phase === 'rearming'; }).reduce(function (n, w) { return n + w.craft.length; }, 0);
};
const makeFighter = function (state: State, wingId: number): Escort {
	return { id: state.nextId++, wingId, kind: 'interceptor', ...worldPoint(state, { x: -110, y: 0 }), hp: ESCORTS.interceptor.hp, cooldown: 0, angle: state.ark.angle };
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
	for (const [i, craft] of wing.craft.entries()) {
		Object.assign(craft, worldPoint(state, { x: -110, y: (i - 1) * 18 }));
		craft.flight = { angle: state.ark.angle, speed: state.ark.speed, side: i % 2 ? -1 : 1, course: 'intercept', run: 1 }; craft.angle = state.ark.angle;
		state.escorts.push(craft);
	}
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
		if (wing.phase === 'ready' || wing.phase === 'rearming') {
			for (const craft of wing.craft) { Object.assign(craft, worldPoint(state, { x: -110, y: 0 })); craft.angle = state.ark.angle; }
		}
		if (wing.phase === 'ready') continue;
		wing.timer = Math.max(0, wing.timer - dt);
		if (wing.phase === 'launching' && wing.timer === 0) { wing.phase = 'sortie'; wing.timer = WING_TIMING.sortie; }
		else if (wing.phase === 'sortie' && (wing.timer === 0 || wing.craft.length === 0)) wing.phase = 'returning';
		else if (wing.phase === 'returning' && wing.craft.every(function (craft) { return distance(craft, worldPoint(state, { x: -110, y: 0 })) < 8; })) {
			state.escorts = state.escorts.filter(function (craft) { return craft.wingId !== wing.id; }); wing.phase = 'rearming'; wing.timer = WING_TIMING.rearm;
		} else if (wing.phase === 'rearming' && wing.timer === 0) wing.phase = 'ready';
	}
};
export const assignGuardian = function (state: State, id: number, sector: Sector): boolean {
	const guardian = state.escorts.find(function (e) { return e.id === id && e.kind === 'guardian' && e.hp > 0; });
	if (!canOrder(state) || !state.experimental || !guardian || guardian.sector === sector) return false;
	guardian.sector = sector; state.orders++; return true;
};
export const setRally = function (state: State, point: Point): boolean {
	if (!canOrder(state) || state.experimental || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
	const offset = localPoint(state, point);
	state.rally = { x: Math.max(-450, Math.min(450, offset.x)), y: Math.max(-370, Math.min(370, offset.y)) }; return true;
};
export const REPAIR_CREWS = 4;
export const repairTargets = function (state: State) {
	return [
		{ id: 'hull', name: 'Hull', integrity: state.hull, maximum: MAX_HULL },
		...(['engines', 'sensors', 'generator'] as const).map(function (id) { return { id, name: id, integrity: state.systems[id].integrity, maximum: 100 }; }),
		...state.mounts.flatMap(function (mount, index) { return mount.weapon ? [{ id: `mount:${index}`, name: `Mount ${index + 1}`, integrity: mount.integrity, maximum: 100 }] : []; }),
	];
};
export const assignRepair = function (state: State, target: string, crews: number): boolean {
	if (!canOrder(state) || state.hull <= 0 || !Number.isInteger(crews) || crews < 0) return false;
	const item = repairTargets(state).find(function (item) { return item.id === target; });
	if (!item || (crews > 0 && item.integrity >= item.maximum)) return false;
	const used = Object.entries(state.repairs).reduce(function (sum, [id, count]) { return sum + (id === target ? 0 : count); }, 0);
	if (used + crews > REPAIR_CREWS) return false;
	if (crews === 0) delete state.repairs[target]; else state.repairs[target] = crews;
	return true;
};
export const repair = function (state: State): boolean { return assignRepair(state, 'hull', state.repairs['hull'] ? 0 : 1); };
export const repairSensors = function (state: State): boolean { return assignRepair(state, 'sensors', state.repairs['sensors'] ? 0 : 1); };
const advanceRepairs = function (state: State, dt: number) {
	if (state.hull <= 0) return;
	for (const [id, crews] of Object.entries(state.repairs)) {
		const item = repairTargets(state).find(function (item) { return item.id === id; });
		if (!item || item.integrity >= item.maximum) { delete state.repairs[id]; continue; }
		const value = Math.min(item.maximum, item.integrity + crews * dt * (id === 'hull' ? 12 : 4));
		if (id === 'hull') state.hull = value;
		else if (id === 'engines' || id === 'sensors' || id === 'generator') state.systems[id].integrity = value;
		else { const mount = state.mounts[Number(id.slice(6))]; if (mount) mount.integrity = value; }
		if (value >= item.maximum) { delete state.repairs[id]; notify(state, `${item.name} restored; ${crews} crews released.`); if (id === 'sensors') state.systems.sensors.repairs++; }
	}
};
// Surface regions: aft cap engines, bow cap sensors. Side strips (|y| >=39):
// generator |x| <=12; sensor arrays 12<x<=20 and x>=116; fitted mounts
// within 12m of their x. Caps first, generator, arrays, then mount index;
// inclusive mount edges. Gaps are ordinary hull. One region per impact.
export const subsystemAt = function (state: State, point: Point): string | undefined {
	if (point.x <= -144) return 'engines';
	if (point.x >= 144) return 'sensors';
	if (Math.abs(point.y) < 39) return undefined;
	if (Math.abs(point.x) <= 12) return 'generator';
	if (point.x >= 116 || (point.x > 12 && point.x <= 20)) return 'sensors';
	const index = state.mounts.findIndex(function (mount) { return !!mount.weapon && Math.sign(mount.y) === Math.sign(point.y) && Math.abs(mount.x - point.x) <= 12; });
	return index < 0 ? undefined : `mount:${index}`;
};
export const subsystemAimPoint = function (state: State, target: string, from?: Point): Point | undefined {
	if (target === 'engines') return worldPoint(state, { x: -145, y: 0 });
	if (target === 'sensors') return worldPoint(state, { x: 16, y: from && localPoint(state, from).y > 0 ? 30 : -30 });
	if (target === 'generator') return worldPoint(state, { x: 0, y: -40 });
	const mount = target.startsWith('mount:') ? state.mounts[Number(target.slice(6))] : undefined;
	return mount?.weapon ? worldPoint(state, { x: mount.x, y: Math.sign(mount.y) * 40 }) : undefined;
};
const damageSubsystem = function (state: State, local: Point, damage: number) {
	const id = subsystemAt(state, local);
	const component = id === 'engines' || id === 'sensors' || id === 'generator' ? state.systems[id] : id ? state.mounts[Number(id.slice(6))] : undefined;
	if (!component || damage <= 0) return;
	const before = component.integrity;
	component.integrity = Math.max(0, before - damage); // 1 penetrating HP = 1 integrity.
	if (conditionMultiplier(before) !== conditionMultiplier(component.integrity)) {
		if (id === 'sensors' && before >= 50) state.systems.sensors.impairments++;
		notify(state, `${id}: ${component.integrity <= 0 ? 'OFFLINE' : 'IMPAIRED'} · assign repair crews.`);
	}
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
	state.effects.push({ x: state.ark.x, y: state.ark.y, radius: 310, life: 0.8, maxLife: 0.8, color: '#88f1e4' });
	for (const enemy of state.enemies) {
		const d = distance(enemy, state.ark);
		if (d < 310) { enemy.hp -= 45; const angle = Math.atan2(enemy.y - state.ark.y, enemy.x - state.ark.x); enemy.x += Math.cos(angle) * 75; enemy.y += Math.sin(angle) * 75; }
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
		return { at: at + i * (wave === 5 ? 0.45 : 0.9), kind, x: Math.cos(arrivalAngle) * (APPROACH.spawnRange + i % 3 * 100), y: Math.sin(arrivalAngle) * (APPROACH.spawnRange + i % 3 * 100) };
	});
};
const startWave = function (state: State) {
	state.wave += 1; state.nextWave = 5 + state.wave * WAVE_INTERVAL; state.cleared = false;
	state.arrivals.push(...waveArrivals(state.wave, state.time));
};
const startEncounter = function (state: State) {
	const encounter = state.scenario?.encounters[state.wave]; if (!encounter) return;
	state.wave++; state.cleared = false; state.nextWave = approachAt(state.scenario?.encounters[state.wave]?.at ?? Infinity);
	const base = SECTOR_POINTS[encounter.sector]; const angle = Math.atan2(base.y, base.x);
	for (let i = 0; i < encounter.count; i++) {
		const bearing = angle + Math.sin(i * 2.4) * 0.35;
		state.arrivals.push({ at: approachAt(encounter.at) + i * encounter.spacing, kind: encounter.kind, x: Math.cos(bearing) * (APPROACH.spawnRange + i % 3 * 100), y: Math.sin(bearing) * (APPROACH.spawnRange + i % 3 * 100) });
	}
};
export const durationFor = function (state: State): number { return state.scenario?.duration ?? ROUTE_SECONDS; };
const contactDirection = function (point: Point): string {
	return Math.abs(point.x) > Math.abs(point.y) ? point.x > 0 ? 'AHEAD' : 'ASTERN' : point.y > 0 ? 'STARBOARD' : 'PORT';
};
export const contactWarning = function (state: State): string {
	// Only real, currently observed actors may generate warnings.
	const contacts = state.enemies.filter(function (enemy) { return enemy.hp > 0 && canAcquire(state, enemy); })
		.sort(function (a, b) { return distance(a, state.ark) - distance(b, state.ark); });
	const contact = contacts[0];
	if (!contact) return 'Scanning for contacts';
	if (contactIntel(state, contact) === 'detected') return `${contactDirection(localPoint(state, contact))} · unclassified contact`;
	const count = contacts.filter(function (enemy) { return enemy.kind === contact.kind && contactDirection(localPoint(state, enemy)) === contactDirection(localPoint(state, contact)) && contactIntel(state, enemy) === 'classified'; }).length;
	return `${contactDirection(localPoint(state, contact))} · ${count} ${contact.kind} · in range`;
};
const effect = function (state: State, point: Point, radius: number, color: string, sourceShot?: Shot) {
	state.effects.push({ x: point.x, y: point.y, radius, life: 0.45, maxLife: 0.45, color, ...(sourceShot ? { sourceShot: { ...sourceShot } } : {}) });
};
const fire = function (state: State, from: Point, to: Point, damage: number, speed: number, side: Shot['side'], weapon: Shot['weapon'], target: number | undefined, sourceVelocity: Point) {
	const angle = Math.atan2(to.y - from.y, to.x - from.x);
	state.shots.push({ id: state.nextId++, x: from.x, y: from.y, vx: Math.cos(angle) * speed + sourceVelocity.x, vy: Math.sin(angle) * speed + sourceVelocity.y, origin: { ...from }, sourceVelocity: { ...sourceVelocity }, damage, side, weapon, target, life: 4 });
};
const interceptTime = function (from: Point, to: Point, velocity: Point, speed: number): number {
	const dx = to.x - from.x; const dy = to.y - from.y;
	const a = velocity.x * velocity.x + velocity.y * velocity.y - speed * speed;
	const b = 2 * (dx * velocity.x + dy * velocity.y); const c = dx * dx + dy * dy;
	if (Math.abs(a) < 1e-8) return b < 0 ? Math.min(4, -c / b) : 0;
	const discriminant = b * b - 4 * a * c;
	if (discriminant < 0) return 0;
	const times = [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)].filter(function (time) { return time >= 0 && time <= 4; });
	return times.length ? Math.min(...times) : 0;
};
const aimAhead = function (from: Point, target: Point, velocity: Point, speed: number): Point {
	const time = interceptTime(from, target, velocity, speed);
	return { x: target.x + velocity.x * time, y: target.y + velocity.y * time };
};
const hostileSolution = function (enemy: Enemy, target: Point, velocity: Point, speed: number): { muzzle: Point; aim: Point; mount?: undefined; height?: undefined; angle?: undefined } | CraftAim | undefined {
	const source = flightVelocity(enemy.flight);
	const predict = function (from: Point) { return aimAhead(from, target, { x: velocity.x - source.x, y: velocity.y - source.y }, speed); };
	if (!hasCraftTurrets(enemy.kind)) return { muzzle: enemy, aim: predict(enemy) };
	return craftTurretSolution(enemy.kind, enemy, enemy.flight?.angle ?? 0, predict);
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
const damageEnemy = function (enemy: Enemy, damage: number, weapon: Shot['weapon']) { enemy.hp -= damage * (weapon === 'rail' ? 1 : ENEMIES[enemy.kind].armor); };
const impactFeedback = function (state: State, point: Point, hull: number, armor = 0, shield = 0, deck = false) {
	state.effects.push({ x: point.x, y: point.y, radius: 18, life: 0.3, maxLife: 0.3, color: '#ffb87b', feedback: { kind: 'impact', shield, armor, hull, deck } });
};
const enemyFeedback = function (state: State, enemy: Enemy, damage: number, weapon: Shot['weapon']) {
	const hull = damage * (weapon === 'rail' ? 1 : ENEMIES[enemy.kind].armor);
	impactFeedback(state, enemy, hull, damage - hull);
};
const segmentDistance = function (point: Point, a: Point, b: Point): number {
	const dx = b.x - a.x; const dy = b.y - a.y; const length = dx * dx + dy * dy;
	const t = length > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
	return distance(point, { x: a.x + dx * t, y: a.y + dy * t });
};
const movingContact = function (point: Point, previous: Point, from: Point, to: Point, radius: number): boolean {
	return segmentDistance({ x: 0, y: 0 }, { x: from.x - previous.x, y: from.y - previous.y }, { x: to.x - point.x, y: to.y - point.y }) < radius;
};
const hullContact = function (state: State, previous: Point, from: Point, to: Point): (Point & { local: Point }) | undefined {
	const c = Math.cos(state.ark.angle); const s = Math.sin(state.ark.angle);
	const start = { x: c * (from.x - previous.x) + s * (from.y - previous.y), y: -s * (from.x - previous.x) + c * (from.y - previous.y) };
	const end = localPoint(state, to);
	let first = 0; let last = 1;
	for (const [a, b, half] of [[start.x, end.x, 145], [start.y, end.y, 40]] as const) {
		const delta = b - a;
		if (Math.abs(delta) < 1e-10) { if (Math.abs(a) > half) return undefined; continue; }
		const t1 = (-half - a) / delta; const t2 = (half - a) / delta;
		first = Math.max(first, Math.min(t1, t2)); last = Math.min(last, Math.max(t1, t2));
		if (first > last) return undefined;
	}
	return { x: from.x + (to.x - from.x) * first, y: from.y + (to.y - from.y) * first, local: { x: start.x + (end.x - start.x) * first, y: start.y + (end.y - start.y) * first } };
};
export const step = function (state: State, dt: number) {
	if (!canOrder(state) || state.status !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
	// The deadline is strict: the tick ending exactly there loses, even if it clears combat.
	const deadline = state.scenario?.deadline;
	if (deadline !== undefined && state.time >= deadline) { state.status = 'lost'; state.resultReason = state.hull <= 0 ? 'hull' : 'deadline'; state.shots = []; return; }
	dt = Math.min(dt, 0.05, deadline === undefined ? Infinity : Math.max(0, deadline - state.time)); state.time += dt;
	const previousArk = { x: state.ark.x, y: state.ark.y };
	const previousEnemies = new Map(state.enemies.map(function (enemy) { return [enemy.id, { x: enemy.x, y: enemy.y }] as const; }));
	const previousEscorts = new Map(state.escorts.map(function (escort) { return [escort.id, { x: escort.x, y: escort.y }] as const; }));
	state.pulseCooldown = Math.max(0, state.pulseCooldown - dt); state.aegisRemaining = Math.max(0, state.aegisRemaining - dt); state.repairCooldown = Math.max(0, state.repairCooldown - dt); state.messageTime = Math.max(0, state.messageTime - dt);
	const distanceBefore = state.systems.distanceTraveled;
	state.systems.sensors.repairCooldown = Math.max(0, state.systems.sensors.repairCooldown - dt);
	state.systems.shield.hitFlash = Math.max(0, state.systems.shield.hitFlash - dt);
	state.systems.distanceTraveled = Math.min(state.systems.routeLength, state.systems.distanceTraveled + effectiveOutputs(state.systems).speed * dt);
	const travel = state.systems.distanceTraveled - distanceBefore;
	state.ark.speed = travel / dt;
	state.ark.x += Math.cos(state.ark.angle) * travel; state.ark.y += Math.sin(state.ark.angle) * travel;
	const carrierVelocity = arkVelocity(state);
	advanceInterdiction(state, dt);
	// The reactor provides a modest income even while enemies remain outside firing range.
	state.salvage += dt * 1.2;
	if (state.time >= state.nextWave) { if (state.scenario) startEncounter(state); else if (state.wave < WAVE_COUNT) startWave(state); }
	for (const arrival of state.arrivals.filter(function (a) { return a.at <= state.time; })) {
		const config = ENEMIES[arrival.kind]; const position = arrivalOutsideField(state, worldPoint(state, arrival), arrival.kind); state.enemies.push({ id: state.nextId++, approaching: true, kind: arrival.kind, x: position.x, y: position.y, hp: config.hp, maxHp: config.hp, cooldown: 0.8 });
	}
	state.arrivals = state.arrivals.filter(function (a) { return a.at > state.time; });
	clearLostPriority(state);
	// Beam tracks last exactly one simulation tick; damage is applied directly.
	state.shots = state.shots.filter(function (shot) { return shot.weapon !== 'beam'; });
	const baseWeaponRate = powerOutputs(state.systems.allocation).weaponRate;
	for (const [mountIndex, mount] of state.mounts.entries()) {
		const weaponRate = baseWeaponRate * conditionMultiplier(mount.integrity);
		mount.cooldown = Math.max(0, mount.cooldown - dt * weaponRate);
		if (!mount.weapon || weaponRate === 0) continue;
		const config = WEAPONS[mount.weapon];
		const origin = mountWorld(state, mount);
		const target = mountTarget(state, mount);
		if (!target) continue;
		// Track the firing solution even while reloading; barrels must finish turning before firing.
		const targetVelocity = flightVelocity(target.flight);
		const aim = mount.weapon === 'beam' ? target : aimAhead(origin, target, { x: targetVelocity.x - carrierVelocity.x, y: targetVelocity.y - carrierVelocity.y }, config.speed);
		const desired = Math.atan2(aim.y - origin.y, aim.x - origin.x) - state.ark.angle;
		const error = Math.atan2(Math.sin(desired - mount.aim), Math.cos(desired - mount.aim));
		const travel = config.rotationSpeed * dt;
		mount.aim += Math.max(-travel, Math.min(travel, error));
		if (Math.abs(error) > travel) continue;
		if (mount.weapon === 'beam') {
			const damage = config.damage * dt * weaponRate * (1 + (mount.level - 1) * 0.55) * (1 + (mount.level - 1) * 0.12);
			damageEnemy(target, damage, 'beam');
			state.shots.push({ id: state.nextId++, x: target.x, y: target.y, beamFrom: origin, vx: 0, vy: 0, damage: 0, side: 'player', weapon: 'beam', target: target.id, life: 4 });
			if (mount.cooldown <= 0) { enemyFeedback(state, target, damage, 'beam'); mount.cooldown = config.reload; }
			continue;
		}
		if (mount.cooldown <= 0) { fire(state, origin, aim, config.damage * (1 + (mount.level - 1) * 0.55), config.speed, 'player', mount.weapon, target.id, carrierVelocity); mount.cooldown = config.reload / (1 + (mount.level - 1) * 0.12); state.effects.push({ ...origin, radius: 1, life: 0.18, maxLife: 0.18, color: '#ffffff', feedback: { kind: 'muzzle', mount: mountIndex, weapon: mount.weapon, aim: mount.aim } }); }
	}
	updateWings(state, dt);
	for (const [i, escort] of state.escorts.entries()) {
		if (escort.hp <= 0) continue;
		const config = ESCORTS[escort.kind]; escort.cooldown -= dt;
		const wing = state.wings.find(function (w) { return w.id === escort.wingId; });
		const phaseAllowsFire = !wing || wing.phase === 'sortie';
		const offset = escort.sector ? SECTOR_POINTS[escort.sector] : wing ? SECTOR_POINTS[wing.assignment] : { x: state.rally.x + Math.cos(i * 2.4) * 45, y: state.rally.y + Math.sin(i * 2.4) * 45 };
		const formation = worldPoint(state, offset);
		const target = !phaseAllowsFire ? undefined : wing || escort.sector ? nearest(escort, state.enemies.filter(function (enemy) { return enemy.hp > 0 && distance(enemy, formation) <= 180; }), 300) : targetFor(state, escort, 300);
		const engaging = escort.kind === 'interceptor' && target && distance(target, formation) < 320;
		const destination = wing?.phase === 'returning' ? worldPoint(state, { x: -110, y: 0 }) : formation;
		const desired = engaging ? fighterCourse(escort, target, 65, 65, config.speed, escort.id % 2 ? -1 : 1, flightVelocity(target.flight), state.escorts)
			: arriveCourse(escort, destination, carrierVelocity);
		escort.flight ??= { angle: escort.angle, speed: state.ark.speed, side: i % 2 ? -1 : 1, course: 'intercept', run: 1 };
		fly(escort, escort.flight, desired, config.speed, escort.kind === 'guardian' ? 1.6 : 4, dt);
		escort.angle = escort.flight.angle;
		if (target && distance(escort, target) <= config.range) {
			const velocity = flightVelocity(target.flight); const sourceVelocity = flightVelocity(escort.flight);
			const predict = function (from: Point) { return aimAhead(from, target, { x: velocity.x - sourceVelocity.x, y: velocity.y - sourceVelocity.y }, 550); };
			const solution = escort.kind === 'guardian' ? craftTurretSolution('guardian', escort, escort.angle, predict) : { muzzle: escort, aim: predict(escort) };
			if (solution) {
				if ('mount' in solution) escort.turretAim = solution;
				if (escort.cooldown > 0) continue;
				fire(state, solution.muzzle, solution.aim, config.damage, 550, 'player', 'escort', target.id, sourceVelocity);
				if ('height' in solution) { const shot = state.shots.at(-1); if (shot) shot.originHeight = solution.height; }
				escort.cooldown = config.reload;
			}
		}
	}
	for (const enemy of state.enemies) {
		if (enemy.hp <= 0) continue;
		const config = ENEMIES[enemy.kind]; enemy.cooldown -= dt;
		const escort = nearest(enemy, state.escorts.filter(function (craft) { return craft.hp > 0; }), 180);
		const relative = localPoint(state, enemy);
		const arkTarget = worldPoint(state, { x: Math.max(-110, Math.min(110, relative.x)), y: Math.max(-30, Math.min(30, relative.y)) });
		const destination = escort ?? arkTarget;
		enemy.flight ??= createFlight(relative, { x: state.ark.x - enemy.x, y: state.ark.y - enemy.y }, config.speed, enemy.id);
		const flight = enemy.flight;
		const approaching = enemy.approaching === true && distance(enemy, state.ark) > SENSOR_CONFIG.shortRange;
		if (!approaching && enemy.approaching) enemy.approaching = false;
		const flightSpeed = approaching ? APPROACH.cruiseSpeed : config.speed;
		const waypoint = navigateField(state, enemy, destination, flightSpeed, dt);
		const desired = waypoint ? arriveCourse(enemy, waypoint, { x: 0, y: 0 }, 2)
			: approaching ? arriveCourse(enemy, destination, carrierVelocity, 0.5)
			: isCapital(enemy) ? capitalCourse(state, enemy, flight, config.range, config.speed)
			: fighterCourse(enemy, escort ?? state.ark, escort ? 60 : enemy.kind === 'bomber' ? 265 : 195, escort ? 60 : enemy.kind === 'bomber' ? 225 : 105, config.speed, enemy.id % 2 ? -1 : 1, escort ? flightVelocity(escort.flight) : carrierVelocity, state.enemies);
		fly(enemy, flight, desired, flightSpeed, isCapital(enemy) ? 0.7 : 3, dt);
		const shotSpeed = enemy.kind === 'bomber' ? 155 : 235;
		const escortSolution = escort ? hostileSolution(enemy, escort, flightVelocity(escort.flight), shotSpeed) : undefined;
		const firingEscort = escortSolution ? escort : undefined;
		const componentAim = subsystemAimPoint(state, enemy.subsystemTarget ?? (enemy.kind === 'bomber' ? 'sensors' : ''), enemy);
		const firingTarget = firingEscort ?? componentAim ?? arkTarget;
		const solution = escortSolution ?? hostileSolution(enemy, componentAim ?? arkTarget, carrierVelocity, shotSpeed);
		if (solution && solution.mount !== undefined) enemy.turretAim = solution;
		const canFire = solution && distance(enemy, firingTarget) <= config.range && !fieldBlocks(state, solution.muzzle, solution.aim);
		if (enemy.kind === 'bomber') {
			const attack = enemy.bomberAttack;
			if (attack?.phase === 'released') {
				attack.remaining -= dt;
				if (attack.remaining <= 0) delete enemy.bomberAttack;
			}
			if (attack?.phase === 'windup') {
				// Track the current target, but never transfer an almost-ready shot to another.
				// Losing range, firing line or the selected escort cancels this preparation.
				if (!canFire || attack.target !== firingEscort?.id) { delete enemy.bomberAttack; continue; }
				attack.remaining = Math.max(0, attack.remaining - dt);
				if (attack.remaining > 1e-9) continue;
			} else {
				if (enemy.cooldown <= 0 && canFire) enemy.bomberAttack = { phase: 'windup', remaining: BOMBER_ATTACK.windup, target: firingEscort?.id };
				continue;
			}
		}
		if (enemy.cooldown <= 0 && canFire && solution) {
			fire(state, solution.muzzle, solution.aim, config.damage, shotSpeed, 'enemy', 'hostile', firingEscort?.id, flightVelocity(flight)); enemy.cooldown = config.reload;
			if (enemy.kind === 'bomber') enemy.bomberAttack = { phase: 'released', remaining: BOMBER_ATTACK.releaseCue };
			const shot = state.shots.at(-1); if (shot && solution.height !== undefined) shot.originHeight = solution.height;
		}
	}
	let arkHit = false;
	for (const shot of state.shots) {
		if (shot.weapon === 'beam') continue;
		const before = { x: shot.x, y: shot.y }; shot.life -= dt;
		if (shot.weapon === 'missile') {
			const target = state.enemies.find(function (e) { return e.id === shot.target && e.hp > 0 && canAcquire(state, e); });
			if (target) { const angle = Math.atan2(target.y - shot.y, target.x - shot.x); shot.vx = Math.cos(angle) * 300 + (shot.sourceVelocity?.x ?? 0); shot.vy = Math.sin(angle) * 300 + (shot.sourceVelocity?.y ?? 0); }
		}
		shot.x += shot.vx * dt; shot.y += shot.vy * dt;
		if (shot.side === 'player') {
			const hit = state.enemies.find(function (enemy) { return enemy.hp > 0 && movingContact(enemy, previousEnemies.get(enemy.id) ?? enemy, before, shot, enemy.kind === 'flagship' ? 38 : enemy.kind === 'armored' ? 23 : 15); });
			if (!hit) continue;
			shot.life = 0;
			if (shot.weapon === 'missile') { for (const enemy of state.enemies) if (distance(hit, enemy) < MISSILE_SPLASH_RADIUS) { enemyFeedback(state, enemy, shot.damage, shot.weapon); damageEnemy(enemy, shot.damage, shot.weapon); } effect(state, hit, MISSILE_SPLASH_RADIUS, '#f9c875'); }
			else { enemyFeedback(state, hit, shot.damage, shot.weapon); damageEnemy(hit, shot.damage, shot.weapon); effect(state, hit, 10, '#a6efe5'); }
		} else {
			const center = state.systems.interdiction.field?.world;
			const blocked = center ? circleHit(before, shot, center, INTERDICTION_CONFIG.radius) : undefined;
			if (blocked) {
				effect(state, blocked, 20, '#d7bf89', shot); shot.life = 0; state.systems.interdiction.blockedShots++; continue;
			}
			const hit = state.escorts.find(function (escort) { return escort.hp > 0 && movingContact(escort, previousEscorts.get(escort.id) ?? escort, before, shot, escort.kind === 'guardian' ? 20 : 12); });
			if (hit) { impactFeedback(state, hit, shot.damage); hit.hp -= shot.damage; shot.life = 0; effect(state, hit, 15, '#ff897e'); }
			else {
				const impact = hullContact(state, previousArk, before, shot);
				if (!impact) continue;
				const overflow = absorbShieldDamage(state.systems, shot.damage);
				impactFeedback(state, impact, overflow * (state.aegisRemaining > 0 ? 0.2 : 1), 0, shot.damage - overflow, true);
				damageSubsystem(state, impact.local, overflow);
				state.hull = Math.max(0, state.hull - overflow * (state.aegisRemaining > 0 ? 0.2 : 1));
				arkHit ||= shot.damage > 0;
				shot.life = 0; effect(state, impact, 22, '#ff897e');
			}
		}
	}
	advanceSystems(state.systems, dt, arkHit);
	advanceRepairs(state, dt);
	for (const enemy of state.enemies) if (enemy.hp <= 0) { state.salvage += ENEMIES[enemy.kind].reward; state.kills += 1; state.effects.push({ x: enemy.x, y: enemy.y, radius: enemy.kind === 'flagship' ? 95 : enemy.kind === 'armored' ? 38 : 24, life: 0.65, maxLife: 0.65, color: '#ffb87b', feedback: { kind: 'destruction' } }); }
	for (const escort of state.escorts) if (escort.hp <= 0) { state.escortLosses++; state.effects.push({ x: escort.x, y: escort.y, radius: 22, life: 0.65, maxLife: 0.65, color: '#81cfe7', feedback: { kind: 'destruction' } }); }
	state.enemies = state.enemies.filter(function (e) { return e.hp > 0; }); state.escorts = state.escorts.filter(function (e) { return e.hp > 0; }); state.shots = state.shots.filter(function (s) { return s.life > 0; });
	for (const wing of state.wings) wing.craft = wing.craft.filter(function (craft) { return craft.hp > 0; });
	state.effects = state.effects.filter(function (e) { e.life -= dt; return e.life > 0; });
	clearLostPriority(state);
	if (state.hull > 0 && state.wave > 0 && !state.cleared && state.enemies.length === 0 && state.arrivals.length === 0) {
		state.cleared = true; state.salvage += 50; state.hull = Math.min(MAX_HULL, state.hull + 60); notify(state, 'Sector secured. +50 salvage · +60 hull. Refit for the next contact.');
	}
	advanceRepairs(state, 0);
	if (state.hull <= 0) { state.status = 'lost'; state.resultReason = 'hull'; state.shots = []; }
	else if (deadline !== undefined && state.time >= deadline) { state.status = 'lost'; state.resultReason = 'deadline'; state.shots = []; }
	else {
		const combatResolved = state.wave === (state.scenario?.encounters.length ?? WAVE_COUNT) && state.enemies.length === 0 && state.arrivals.length === 0;
		const complete = (deadline !== undefined || state.time >= durationFor(state)) && state.systems.distanceTraveled >= state.systems.routeLength && combatResolved;
		if (complete) { state.status = 'won'; state.resultReason = 'arrival'; state.shots = []; }
	}
};
