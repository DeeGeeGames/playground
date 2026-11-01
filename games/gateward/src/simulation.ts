import { tactical } from './combat-scale';
import { defenseArrivals, defenseTrigger, VOYAGE_DEFENSE, type RouteDefense } from './route-defense';
import { avoidTraffic, resolveTraffic, traffic, trafficWaypoint } from './ship-traffic';
import { CARRIER_BAYS, CARRIER_LAUNCH, SMALL_CRAFT_SPEED_SCALE, craftScale, enemyRadius } from './ship-config';
import { craftTurretSolution, hasCraftTurrets, type CraftAim } from './craft-turrets';
import { advanceInterdiction, arrivalOutsideField, circleHit, enemyClearance, fieldBlocks, INTERDICTION_CONFIG, navigateField, type Detour } from './interdiction';
import { canAcquire, contactIntel, SENSOR_CONFIG } from './sensors';
import { ESCORT_DRILL, SYSTEMS_TRIAL, type Scenario } from './scenarios';
import { ARK_SPEED_SCALE, conditionMultiplier, effectiveOutputs, absorbShieldDamage, advanceSystems, createSystems, POWER_CHANNELS, POWER_PRESETS, powerOutputs, REACTOR_UNITS, type Allocation, type PowerChannel, type SystemsState } from './systems';
import { altitudeCourse, arriveCourse, capitalCourse, createFlight, fighterCourse, fly, isCapital, type Flight } from './flight';
import { DECK_ALTITUDE, arkVelocity, flightVelocity, localPoint, mountWorld, worldPoint } from './space';
import { createEscortCoverage, coveragePlan, coverageStation, pointSector, type CoveragePriority, type EscortCoverage } from './escort-coverage';
// z is altitude relative to the nominal flight layer; omitted values use zero.
export type Point = { x: number; y: number; z?: number };
export type Weapon = 'flak' | 'rail' | 'missile' | 'beam';
export type EnemyKind = 'raider' | 'bomber' | 'armored' | 'flagship' | 'carrier';
export type EscortKind = 'interceptor' | 'guardian';
export const MAX_HULL = 1200;
export const ROUTE_SECONDS = 210;
export const WAVE_INTERVAL = 28;
export const WAVE_COUNT = 6;
// Move the approach earlier while retaining the existing mission clocks.
export const APPROACH = { leadTime: 15, spawnRange: tactical(2200), cruiseSpeed: tactical(60) } as const;
const approachAt = function (combatAt: number): number { return Math.max(0, combatAt - APPROACH.leadTime); };
export const WEAPONS = {
	beam: { name: 'Beam', cost: 125, range: tactical(300), damage: 48, reload: 0.4, speed: 0, rotationSpeed: Math.PI, description: 'Sustained instant damage. Armor reduces damage.' },
	flak: { name: 'Flak', cost: 75, range: tactical(255), damage: 13, reload: 0.32, speed: tactical(650), rotationSpeed: Math.PI * 2, description: 'Rapid fire. Prefers classified light raiders. Focus overrides.' },
	rail: { name: 'Railgun', cost: 115, range: tactical(440), damage: 95, reload: 2.2, speed: tactical(1100), rotationSpeed: Math.PI / 2, description: 'Pierces armor. Prefers classified armored ships and flagships. Focus overrides.' },
	missile: { name: 'Missile', cost: 135, range: tactical(355), damage: 52, reload: 1.8, speed: tactical(300), rotationSpeed: Math.PI * 2 / 3, description: `Homing splash. Prefers detected clusters within ${tactical(85)}m. Focus overrides.` },
};
const GUARDIAN_SPEED_SCALE = 0.125;
const CAPITAL_SPEED_SCALE = 0.25;
const GUARDIAN_THRUST_SPEED_SCALE = 0.5;
export const ESCORTS = {
	interceptor: { name: 'Interceptor wing', cost: 85, count: 3, hp: 65, speed: tactical(160) * SMALL_CRAFT_SPEED_SCALE, range: tactical(155), damage: 10, reload: 0.65 },
	guardian: { name: 'Guardian', cost: 105, count: 1, hp: 260, speed: tactical(85) * GUARDIAN_SPEED_SCALE, range: tactical(240), damage: 24, reload: 0.9 },
};
export const ENEMIES = {
	carrier: { hp: 600, speed: tactical(38) * CAPITAL_SPEED_SCALE, range: tactical(400), damage: 0, reload: 1, reward: 45, armor: 0.7 },
	raider: { hp: 45, speed: tactical(50) * SMALL_CRAFT_SPEED_SCALE, range: tactical(100), damage: 7, reload: 1.2, reward: 9, armor: 1 },
	bomber: { hp: 95, speed: tactical(30) * SMALL_CRAFT_SPEED_SCALE, range: tactical(290), damage: 34, reload: 3.8, reward: 17, armor: 1 },
	armored: { hp: 260, speed: tactical(40) * CAPITAL_SPEED_SCALE, range: tactical(185), damage: 22, reload: 2.4, reward: 28, armor: 0.48 },
	flagship: { hp: 2400, speed: tactical(36) * CAPITAL_SPEED_SCALE, range: tactical(370), damage: 55, reload: 2.8, reward: 180, armor: 0.7 },
};
export interface Mount extends Point { integrity: number; weapon: Weapon | undefined; level: number; cooldown: number; aim: number }
export const BOMBER_ATTACK = { windup: 2, releaseCue: 0.35 } as const;
export type BomberAttack = { phase: 'windup'; remaining: number; target: number | undefined } | { phase: 'released'; remaining: number };
export interface Enemy extends Point { defense?: RouteDefense; hangar?: { remaining: number; launched: number; cooldown: number }; launchRemaining?: number; launchedBy?: number; subsystemTarget?: string; approaching?: boolean; bomberAttack?: BomberAttack; turretAim?: CraftAim; flight?: Flight; interdictionSide?: { fieldId: number; side: -1 | 1 }; detour?: Detour; id: number; kind: EnemyKind; hp: number; maxHp: number; cooldown: number }
export interface Escort extends Point { turretAim?: CraftAim; flight?: Flight; wingId?: number; sector?: Sector; id: number; kind: EscortKind; hp: number; cooldown: number; angle: number }
export interface Shot extends Point { vz?: number; originHeight?: number; origin?: Point; sourceVelocity?: Point; beamFrom?: Point; sensorDamage?: number; id: number; vx: number; vy: number; damage: number; side: 'player' | 'enemy'; weapon: Weapon | 'escort' | 'hostile'; target: number | undefined; life: number }
export type CombatFeedback =
	| { kind: 'muzzle'; mount: number; weapon: Weapon; aim: number }
	| { kind: 'impact'; shield: number; armor: number; hull: number; deck: boolean }
	| { kind: 'destruction' };
export interface Effect extends Point { feedback?: CombatFeedback; sourceShot?: Shot; radius: number; life: number; maxLife: number; color: string }
export interface Arrival { defense?: RouteDefense; fighters?: number; at: number; kind: EnemyKind; x: number; y: number }
export const SECTORS = ['port', 'starboard', 'ahead', 'astern'] as const;
export type Sector = typeof SECTORS[number];
export const SECTOR_POINTS: Record<Sector, Point> = { port: { x: 0, y: -tactical(230) }, starboard: { x: 0, y: tactical(230) }, ahead: { x: tactical(280), y: 0 }, astern: { x: -tactical(280), y: 0 } };
export interface Wing { id: number; phase: 'ready' | 'launching' | 'sortie' | 'returning' | 'rearming'; timer: number; craft: Escort[]; assignment: Sector; }
export const WING_TIMING = { launch: 2, sortie: 18, rearm: 10 };
export interface State {
	coverage: EscortCoverage;
	fightersScrambled: boolean;
	repairs: Record<string, number>;
	ark: Point & { angle: number; speed: number };
	routeOrigin: Point;
	systems: SystemsState;
	resultReason: 'hull' | 'deadline' | 'arrival' | undefined;
	scenario: Scenario | undefined; experimental: boolean; wings: Wing[]; launches: number; orders: number; escortLosses: number; coverageDegrees: number; paused: boolean; focused: boolean;
	// nextWave is a route-distance trigger in Full Voyage, a time in the trials.
	time: number; hull: number; salvage: number; wave: number; nextWave: number; kills: number;
	status: 'fitting' | 'running' | 'won' | 'lost'; mounts: Mount[]; enemies: Enemy[]; escorts: Escort[];
	shots: Shot[]; effects: Effect[]; arrivals: Arrival[]; nextId: number;
	rally: Point; priority: number | undefined; pulseCooldown: number; aegisRemaining: number; repairCooldown: number;
	cleared: boolean; message: string; messageTime: number;
}
export const distance = function (a: Point, b: Point): number { return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)); };
export const MISSILE_SPLASH_RADIUS = tactical(85);

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
		return Number(weapon === 'flak' ? enemy.kind === 'raider' : weapon === 'rail' && isCapital(enemy));
	};
	const origin = mountWorld(state, mount);
	return candidates.map(function (enemy) { return { enemy, score: score(enemy), distance: distance(origin, enemy) }; })
		.sort(function (a, b) { return b.score - a.score || a.distance - b.distance || a.enemy.id - b.enemy.id; })[0]?.enemy;
};
export const createState = function (options: { coverageDegrees?: number; experimental?: boolean; scenario?: 'drill' | 'systems' } = {}): State {
	const scenario = options.scenario === 'systems' ? SYSTEMS_TRIAL : options.scenario === 'drill' ? ESCORT_DRILL : undefined;
	return {
		coverage: createEscortCoverage(), fightersScrambled: false,
		repairs: {}, ark: { x: 0, y: 0, angle: 0, speed: 0 }, routeOrigin: { x: 0, y: 0 },
		resultReason: undefined,
		systems: createSystems((scenario?.duration ?? ROUTE_SECONDS) * powerOutputs(POWER_PRESETS.balanced).speed / ARK_SPEED_SCALE),
		scenario, experimental: scenario !== undefined || (options.experimental ?? false), wings: [], launches: 0, orders: 0, escortLosses: 0, coverageDegrees: options.coverageDegrees ?? (scenario ? 240 : 120), paused: false, focused: true,
		time: 0, hull: MAX_HULL, salvage: scenario?.salvage ?? 300, wave: 0, nextWave: scenario ? approachAt(scenario.encounters[0]?.at ?? Infinity) : 0, kills: 0, status: 'fitting',
		mounts: [-1, 1].flatMap(function (side) { return [-96, -32, 32, 96].map(function (x): Mount { return { integrity: 100, x, y: side * 43, weapon: undefined, level: 0, cooldown: 0, aim: side * Math.PI / 2 }; }); }),
		enemies: [], escorts: [], shots: [], effects: [], arrivals: [], nextId: 1, rally: { x: 0, y: 0 }, priority: undefined,
		pulseCooldown: 0, aegisRemaining: 0, repairCooldown: 0, cleared: false, message: 'Fit your ship, then depart. Weapons fire automatically.', messageTime: 8,
	};
};
export const notify = function (state: State, message: string) { state.message = message; state.messageTime = 4; };
const canOrder = function (state: State) { return !state.paused && state.focused && (state.status === 'fitting' || state.status === 'running'); };
export const setCoveragePriority = function (state: State, sector: Sector, priority: CoveragePriority): boolean {
	if (!canOrder(state) || (state.coverage.all !== undefined && state.coverage.all !== sector)) return false;
	state.coverage.enabled = true;
	if (priority === 'all') state.coverage.all = sector;
	else { state.coverage.all = undefined; state.coverage.priorities[sector] = priority; }
	state.orders++; updateEscortCoverage(state); return true;
};
export const balanceCoverage = function (state: State): boolean {
	if (!canOrder(state) || state.coverage.all !== undefined) return false;
	state.coverage = createEscortCoverage(); state.orders++; updateEscortCoverage(state); return true;
};
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
	if (local.x < INTERDICTION_CONFIG.minRelativeX || Math.hypot(local.x, local.y) > INTERDICTION_CONFIG.maxRange) return `Place ahead or beside the ark, within ${INTERDICTION_CONFIG.maxRange}m`;
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
	return distance({ ...mount, z: mountWorld(state, mount).z ?? 0 }, local) <= range + 1e-8 && Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= arc / 2 + 1e-8;
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
	if (kind === 'interceptor') {
		const wing: Wing = { id: state.nextId++, phase: 'ready', timer: 0, craft: [], assignment: 'port' };
		wing.craft = Array.from({ length: 3 }, function () { return makeFighter(state, wing.id); }); state.wings.push(wing); updateEscortCoverage(state); return true;
	}
	for (let i = 0; i < config.count; i++) state.escorts.push({ id: state.nextId++, kind, ...(state.experimental && kind === 'guardian' ? { sector: 'port' as const } : {}), ...worldPoint(state, { x: -220, y: (i - 1) * 22 }), hp: config.hp, cooldown: i * 0.1, angle: state.ark.angle });
	updateEscortCoverage(state);
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
const launchWing = function (state: State, id: number, sector: Sector): boolean {
	const wing = state.wings.find(function (w) { return w.id === id; });
	if (!wing || scrambleReason(state, wing)) return false;
	wing.assignment = sector; wing.phase = 'launching'; wing.timer = WING_TIMING.launch;
	for (const [i, craft] of wing.craft.entries()) {
		Object.assign(craft, worldPoint(state, { x: -180, y: (i - 1) * 22, z: 0 }));
		craft.flight = { angle: state.ark.angle, speed: state.ark.speed, side: i % 2 ? -1 : 1, course: 'intercept', run: 1 }; craft.angle = state.ark.angle;
		state.escorts.push(craft);
	}
	state.launches++; state.orders++; return true;
};
// Retain explicit per-wing orders for experiments and callers.
export const scramble = function (state: State, id: number, sector: Sector): boolean {
	if (!launchWing(state, id, sector)) return false;
	for (const craft of state.wings.find(function (wing) { return wing.id === id; })?.craft ?? []) delete craft.sector;
	state.coverage.enabled = false; return true;
};
export const scrambleAll = function (state: State): boolean {
	if (!canOrder(state) || state.status !== 'running' || state.fightersScrambled || !state.wings.some(function (wing) { return wing.craft.some(function (craft) { return craft.hp > 0; }); })) return false;
	state.fightersScrambled = true;
	state.coverage.enabled = true;
	state.orders++;
	updateEscortCoverage(state);
	return true;
};
export const recallAll = function (state: State): boolean {
	if (!canOrder(state) || (!state.fightersScrambled && !state.wings.some(function (wing) { return wing.phase === 'launching' || wing.phase === 'sortie'; }))) return false;
	state.fightersScrambled = false;
	for (const wing of state.wings) {
		if (wing.phase !== 'launching' && wing.phase !== 'sortie') continue;
		wing.phase = 'returning'; wing.timer = 0;
	}
	state.orders++;
	return true;
};
const updateEscortCoverage = function (state: State) {
	if (!state.coverage.enabled) return;
	const plan = coveragePlan(state);
	for (const wing of state.wings) {
		const sector = plan.get(`wing-${wing.id}`);
		if (sector) wing.assignment = sector;
		if (state.fightersScrambled && sector && wing.phase === 'ready' && wing.craft.length > 0 && state.status === 'running') launchWing(state, wing.id, sector);
		for (const craft of wing.craft) { if (sector) craft.sector = sector; else delete craft.sector; }
	}
	for (const craft of state.escorts) {
		if (craft.wingId !== undefined) continue;
		const sector = plan.get(`craft-${craft.id}`); if (sector) craft.sector = sector; else delete craft.sector;
	}
};
export const replaceFighters = function (state: State, id: number): boolean {
	const wing = state.wings.find(function (w) { return w.id === id; });
	if (!canOrder(state) || !wing || (wing.phase !== 'ready' && wing.phase !== 'rearming') || wing.craft.length >= 3) return false;
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
			for (const craft of wing.craft) { Object.assign(craft, worldPoint(state, { x: -110, y: 0, z: 0 })); craft.angle = state.ark.angle; delete craft.flight; }
		}
		if (wing.phase === 'ready') continue;
		wing.timer = Math.max(0, wing.timer - dt);
		if (wing.phase === 'launching' && wing.timer === 0) { wing.phase = 'sortie'; wing.timer = WING_TIMING.sortie; }
		else if (wing.phase === 'sortie' && (wing.timer === 0 || wing.craft.length === 0)) wing.phase = 'returning';
		else if (wing.phase === 'returning') {
			// Recover craft individually so traffic spacing cannot prevent the
			// entire wing from satisfying one simultaneous docking test.
			state.escorts = state.escorts.filter(function (craft) {
				return craft.wingId !== wing.id || distance(craft, worldPoint(state, { x: -tactical(210), y: 0 })) >= tactical(45);
			});
			if (!state.escorts.some(function (craft) { return craft.wingId === wing.id; })) { wing.phase = 'rearming'; wing.timer = WING_TIMING.rearm; }
		} else if (wing.phase === 'rearming' && wing.timer === 0) wing.phase = 'ready';
	}
};
export const assignGuardian = function (state: State, id: number, sector: Sector): boolean {
	const guardian = state.escorts.find(function (e) { return e.id === id && e.kind === 'guardian' && e.hp > 0; });
	if (!canOrder(state) || !state.experimental || !guardian || guardian.sector === sector) return false;
	guardian.sector = sector; state.coverage.enabled = false; state.orders++; return true;
};
export const setRally = function (state: State, point: Point): boolean {
	if (!canOrder(state) || state.experimental || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
	const offset = localPoint(state, point);
	state.coverage.enabled = false; for (const craft of state.escorts) delete craft.sector;
	state.rally = { x: Math.max(-tactical(450), Math.min(tactical(450), offset.x)), y: Math.max(-tactical(370), Math.min(tactical(370), offset.y)) }; return true;
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
	if (target === 'engines') return worldPoint(state, { x: -145, y: 0, z: DECK_ALTITUDE });
	if (target === 'sensors') return worldPoint(state, { x: 16, y: from && localPoint(state, from).y > 0 ? 30 : -30, z: DECK_ALTITUDE });
	if (target === 'generator') return worldPoint(state, { x: 0, y: -40, z: DECK_ALTITUDE });
	const mount = target.startsWith('mount:') ? state.mounts[Number(target.slice(6))] : undefined;
	return mount?.weapon ? worldPoint(state, { x: mount.x, y: Math.sign(mount.y) * 40, z: DECK_ALTITUDE }) : undefined;
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
	state.effects.push({ x: state.ark.x, y: state.ark.y, radius: tactical(310), life: 0.8, maxLife: 0.8, color: '#88f1e4' });
	for (const enemy of state.enemies) {
		const d = distance(enemy, state.ark);
		if (d < tactical(310)) { enemy.hp -= 45; const angle = Math.atan2(enemy.y - state.ark.y, enemy.x - state.ark.x); enemy.x += Math.cos(angle) * tactical(75); enemy.y += Math.sin(angle) * tactical(75); }
	}
	notify(state, 'AEGIS: incoming rounds cleared. 80% hull protection for 5 seconds.'); return true;
};
export const WAVE_NAMES = ['Scouting party', 'Bomber screen', 'Ironclad advance', 'Crossfire', 'The swarm', 'The gatekeeper'];
export const waveSide = function (wave: number): string { return ['PORT', 'STARBOARD', 'BOW', 'BOTH FLANKS', 'ASTERN', 'BOW + FLANKS'][(wave - 1) % 6] ?? 'UNKNOWN'; };
// Keep each flank's finite fighter complement aboard one arriving carrier.
export const embarkFighters = function (arrivals: readonly Arrival[]): Arrival[] {
	const result = arrivals.filter(function (arrival) { return arrival.kind !== 'raider'; });
	for (const side of [-1, 1]) {
		const fighters = arrivals.filter(function (arrival) { return arrival.kind === 'raider' && (arrival.defense?.side ?? (arrival.y < 0 ? -1 : 1)) === side; });
		const first = fighters[0];
		if (first) result.push({ ...first, kind: 'carrier', fighters: fighters.length });
	}
	return result.sort(function (a, b) { return a.at - b.at; });
};
const startWave = function (state: State) {
	state.wave += 1; state.cleared = false;
	state.nextWave = state.wave < WAVE_COUNT ? defenseTrigger(state.systems.routeLength, state.wave + 1, WAVE_COUNT) : Infinity;
	state.arrivals.push(...embarkFighters(defenseArrivals(state, WAVE_COUNT)));
};
const startEncounter = function (state: State) {
	const encounter = state.scenario?.encounters[state.wave]; if (!encounter) return;
	state.wave++; state.cleared = false; state.nextWave = approachAt(state.scenario?.encounters[state.wave]?.at ?? Infinity);
	const base = SECTOR_POINTS[encounter.sector]; const angle = Math.atan2(base.y, base.x);
	const arrivals: Arrival[] = [];
	for (let i = 0; i < encounter.count; i++) {
		const bearing = angle + Math.sin(i * 2.4) * 0.35;
		arrivals.push({ at: approachAt(encounter.at) + i * encounter.spacing, kind: encounter.kind, x: Math.cos(bearing) * (APPROACH.spawnRange + i % 3 * tactical(100)), y: Math.sin(bearing) * (APPROACH.spawnRange + i % 3 * tactical(100)) });
	}
	state.arrivals.push(...embarkFighters(arrivals));
};
const advanceCarrierHangar = function (state: State, carrier: Enemy, flight: Flight, dt: number): void {
	const hangar = carrier.hangar;
	if (!hangar || hangar.remaining <= 0 || distance(carrier, state.ark) > CARRIER_LAUNCH.range) return;
	hangar.cooldown -= dt;
	if (hangar.cooldown > 0) return;
	const bay = CARRIER_BAYS[hangar.launched % CARRIER_BAYS.length];
	if (!bay) return;
	const c = Math.cos(flight.angle); const s = Math.sin(flight.angle); const scale = craftScale('carrier');
	const position = { z: carrier.z ?? 0, x: carrier.x + scale * (c * bay.x - s * bay.y), y: carrier.y + scale * (s * bay.x + c * bay.y) };
	const exit = { x: position.x + c * CARRIER_LAUNCH.speed * CARRIER_LAUNCH.clearanceTime, y: position.y + s * CARRIER_LAUNCH.speed * CARRIER_LAUNCH.clearanceTime };
	const field = state.systems.interdiction.field;
	if (field && circleHit(position, exit, field.world, enemyClearance({ kind: 'raider' }))) return;
	state.enemies.push({ ...position, id: state.nextId++, kind: 'raider', hp: ENEMIES.raider.hp, maxHp: ENEMIES.raider.hp, cooldown: 0.8,
		...(carrier.defense ? { defense: { ...carrier.defense } } : {}), launchedBy: carrier.id, launchRemaining: CARRIER_LAUNCH.clearanceTime, flight: { ...flight, vz: 0, pitch: 0, speed: CARRIER_LAUNCH.speed, course: 'intercept' } });
	hangar.remaining--; hangar.launched++; hangar.cooldown += CARRIER_LAUNCH.interval;
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
	state.effects.push({ x: point.x, y: point.y, ...(point.z === undefined ? {} : { z: point.z }), radius, life: 0.45, maxLife: 0.45, color, ...(sourceShot ? { sourceShot: { ...sourceShot } } : {}) });
};
const fire = function (state: State, from: Point, to: Point, damage: number, speed: number, side: Shot['side'], weapon: Shot['weapon'], target: number | undefined, sourceVelocity: Point) {
	const angle = Math.atan2(to.y - from.y, to.x - from.x);
	const dz = (to.z ?? 0) - (from.z ?? 0);
	const planar = Math.hypot(to.x - from.x, to.y - from.y);
	const magnitude = Math.hypot(planar, dz);
	const horizontalSpeed = magnitude > 0 ? speed * planar / magnitude : speed;
	state.shots.push({ id: state.nextId++, x: from.x, y: from.y, z: from.z ?? 0, vz: (magnitude > 0 ? speed * dz / magnitude : 0) + (sourceVelocity.z ?? 0), vx: Math.cos(angle) * horizontalSpeed + sourceVelocity.x, vy: Math.sin(angle) * horizontalSpeed + sourceVelocity.y, origin: { ...from }, sourceVelocity: { ...sourceVelocity }, damage, side, weapon, target, life: 4 });
};
const interceptTime = function (from: Point, to: Point, velocity: Point, speed: number): number {
	const dx = to.x - from.x; const dy = to.y - from.y; const dz = (to.z ?? 0) - (from.z ?? 0);
	const a = velocity.x * velocity.x + velocity.y * velocity.y + (velocity.z ?? 0) ** 2 - speed * speed;
	const b = 2 * (dx * velocity.x + dy * velocity.y + dz * (velocity.z ?? 0)); const c = dx * dx + dy * dy + dz * dz;
	if (Math.abs(a) < 1e-8) return b < 0 ? Math.min(4, -c / b) : 0;
	const discriminant = b * b - 4 * a * c;
	if (discriminant < 0) return 0;
	const times = [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)].filter(function (time) { return time >= 0 && time <= 4; });
	return times.length ? Math.min(...times) : 0;
};
const aimAhead = function (from: Point, target: Point, velocity: Point, speed: number): Point {
	const time = interceptTime(from, target, velocity, speed);
	return { x: target.x + velocity.x * time, y: target.y + velocity.y * time, z: (target.z ?? 0) + (velocity.z ?? 0) * time };
};
const hostileSolution = function (enemy: Enemy, target: Point, velocity: Point, speed: number): { muzzle: Point; aim: Point; mount?: undefined; height?: undefined; angle?: undefined } | CraftAim | undefined {
	const source = flightVelocity(enemy.flight);
	const predict = function (from: Point) { return aimAhead(from, target, { x: velocity.x - source.x, y: velocity.y - source.y, z: (velocity.z ?? 0) - (source.z ?? 0) }, speed); };
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
	state.effects.push({ x: point.x, y: point.y, ...(point.z === undefined ? {} : { z: point.z }), radius: 18, life: 0.3, maxLife: 0.3, color: '#ffb87b', feedback: { kind: 'impact', shield, armor, hull, deck } });
};
const enemyFeedback = function (state: State, enemy: Enemy, damage: number, weapon: Shot['weapon']) {
	const hull = damage * (weapon === 'rail' ? 1 : ENEMIES[enemy.kind].armor);
	impactFeedback(state, enemy, hull, damage - hull);
};
const segmentDistance = function (point: Point, a: Point, b: Point): number {
	const dx = b.x - a.x; const dy = b.y - a.y; const dz = (b.z ?? 0) - (a.z ?? 0); const length = dx * dx + dy * dy + dz * dz;
	const t = length > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy + ((point.z ?? 0) - (a.z ?? 0)) * dz) / length)) : 0;
	return distance(point, { x: a.x + dx * t, y: a.y + dy * t, z: (a.z ?? 0) + dz * t });
};
const movingContact = function (point: Point, previous: Point, from: Point, to: Point, radius: number): boolean {
	return segmentDistance({ x: 0, y: 0 }, { x: from.x - previous.x, y: from.y - previous.y, z: (from.z ?? 0) - (previous.z ?? 0) }, { x: to.x - point.x, y: to.y - point.y, z: (to.z ?? 0) - (point.z ?? 0) }) < radius;
};
const hullContact = function (state: State, previous: Point, from: Point, to: Point): (Point & { local: Point }) | undefined {
	const c = Math.cos(state.ark.angle); const s = Math.sin(state.ark.angle);
	const start = { x: c * (from.x - previous.x) + s * (from.y - previous.y), y: -s * (from.x - previous.x) + c * (from.y - previous.y) };
	const end = localPoint(state, to);
	let first = 0; let last = 1;
	for (const [a, b, half] of [[start.x, end.x, 145], [start.y, end.y, 40], [from.z === undefined ? 0 : from.z - DECK_ALTITUDE, to.z === undefined ? 0 : to.z - DECK_ALTITUDE, 24]] as const) {
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
	const previousEnemies = new Map(state.enemies.map(function (enemy) { return [enemy.id, { x: enemy.x, y: enemy.y, z: enemy.z ?? 0 }] as const; }));
	const previousEscorts = new Map(state.escorts.map(function (escort) { return [escort.id, { x: escort.x, y: escort.y, z: escort.z ?? 0 }] as const; }));
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
	if ((state.scenario ? state.time : state.systems.distanceTraveled) >= state.nextWave) { if (state.scenario) startEncounter(state); else if (state.wave < WAVE_COUNT) startWave(state); }
	for (const arrival of state.arrivals.filter(function (a) { return a.at <= state.time; })) {
		const config = ENEMIES[arrival.kind]; const position = arrivalOutsideField(state, arrival.defense ? arrival : worldPoint(state, arrival), arrival.kind); state.enemies.push({ id: state.nextId++, ...(arrival.defense ? { defense: { ...arrival.defense } } : { approaching: true }), kind: arrival.kind, x: position.x, y: position.y, hp: config.hp, maxHp: config.hp, cooldown: 0.8, ...(arrival.kind === 'carrier' ? { hangar: { remaining: arrival.fighters ?? 8, launched: 0, cooldown: 0 } } : {}) });
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
		const aim = mount.weapon === 'beam' ? target : aimAhead(origin, target, { x: targetVelocity.x - carrierVelocity.x, y: targetVelocity.y - carrierVelocity.y, z: targetVelocity.z ?? 0 }, config.speed);
		const desired = Math.atan2(aim.y - origin.y, aim.x - origin.x) - state.ark.angle;
		const error = Math.atan2(Math.sin(desired - mount.aim), Math.cos(desired - mount.aim));
		const travel = config.rotationSpeed * dt;
		mount.aim += Math.max(-travel, Math.min(travel, error));
		if (Math.abs(error) > travel) continue;
		if (mount.weapon === 'beam') {
			const damage = config.damage * dt * weaponRate * (1 + (mount.level - 1) * 0.55) * (1 + (mount.level - 1) * 0.12);
			damageEnemy(target, damage, 'beam');
			state.shots.push({ id: state.nextId++, x: target.x, y: target.y, z: target.z ?? 0, beamFrom: origin, vx: 0, vy: 0, damage: 0, side: 'player', weapon: 'beam', target: target.id, life: 4 });
			if (mount.cooldown <= 0) { enemyFeedback(state, target, damage, 'beam'); mount.cooldown = config.reload; }
			continue;
		}
		if (mount.cooldown <= 0) { fire(state, origin, aim, config.damage * (1 + (mount.level - 1) * 0.55), config.speed, 'player', mount.weapon, target.id, carrierVelocity); mount.cooldown = config.reload / (1 + (mount.level - 1) * 0.12); state.effects.push({ ...origin, radius: 1, life: 0.18, maxLife: 0.18, color: '#ffffff', feedback: { kind: 'muzzle', mount: mountIndex, weapon: mount.weapon, aim: mount.aim } }); }
	}
	updateWings(state, dt);
	updateEscortCoverage(state);
	const neighbors = traffic(state);
	for (const [i, escort] of state.escorts.entries()) {
		if (escort.hp <= 0) continue;
		const config = ESCORTS[escort.kind]; escort.cooldown -= dt;
		const wing = state.wings.find(function (w) { return w.id === escort.wingId; });
		const phaseAllowsFire = !wing || wing.phase === 'sortie';
		const offset = escort.sector ? SECTOR_POINTS[escort.sector] : wing ? SECTOR_POINTS[wing.assignment] : { x: state.rally.x + Math.cos(i * 2.4) * tactical(45), y: state.rally.y + Math.sin(i * 2.4) * tactical(45) };
		const formation = state.coverage.enabled ? coverageStation(state, escort.id, escort.sector) : worldPoint(state, wing ? { x: offset.x + (i % 3 - 1) * tactical(50), y: offset.y } : offset);
		const target = state.coverage.enabled
			? !phaseAllowsFire || !escort.sector ? undefined : nearest(escort, state.enemies.filter(function (enemy) { return enemy.hp > 0 && pointSector(state, enemy) === escort.sector && distance(enemy, formation) <= tactical(300); }), tactical(300))
			: !phaseAllowsFire ? undefined : wing || escort.sector ? nearest(escort, state.enemies.filter(function (enemy) { return enemy.hp > 0 && distance(enemy, formation) <= tactical(180); }), tactical(300)) : targetFor(state, escort, tactical(300));
		const engaging = escort.kind === 'interceptor' && target && distance(target, formation) < tactical(320);
		const destination = wing?.phase === 'returning' ? worldPoint(state, { x: -tactical(210), y: 0 }) : formation;
		const desired = engaging ? fighterCourse(escort, target, tactical(65), tactical(65), config.speed, escort.id % 2 ? -1 : 1, flightVelocity(target.flight), state.escorts)
			: arriveCourse(escort, trafficWaypoint(state, escort, destination, escort.kind), carrierVelocity, escort.kind === 'guardian' ? 0.08 : 1.5);
		escort.flight ??= { angle: escort.angle, speed: Math.min(state.ark.speed, config.speed), side: i % 2 ? -1 : 1, course: 'intercept', run: 1 };
		desired.z = (altitudeCourse(escort.id, state.time, escort.kind === 'guardian', engaging ? target : destination, wing?.phase === 'returning' || wing?.phase === 'launching') - (escort.z ?? 0)) * 0.8;
		const hull = neighbors.find(function (hull) { return hull.id === escort.id; });
		fly(escort, escort.flight, hull ? avoidTraffic(hull, desired, neighbors, config.speed) : desired, config.speed, escort.kind === 'guardian' ? 1.6 : 4, dt, true, escort.kind === 'guardian', escort.kind === 'guardian' ? config.speed / GUARDIAN_THRUST_SPEED_SCALE : config.speed, escort.kind === 'interceptor' ? SMALL_CRAFT_SPEED_SCALE : 1);
		escort.angle = escort.flight.angle;
		if (target && distance(escort, target) <= config.range) {
			const velocity = flightVelocity(target.flight); const sourceVelocity = flightVelocity(escort.flight);
			const predict = function (from: Point) { return aimAhead(from, target, { x: velocity.x - sourceVelocity.x, y: velocity.y - sourceVelocity.y, z: (velocity.z ?? 0) - (sourceVelocity.z ?? 0) }, tactical(550)); };
			const solution = escort.kind === 'guardian' ? craftTurretSolution('guardian', escort, escort.angle, predict) : { muzzle: escort, aim: predict(escort) };
			if (solution) {
				if ('mount' in solution) escort.turretAim = solution;
				if (escort.cooldown > 0) continue;
				fire(state, solution.muzzle, solution.aim, config.damage, tactical(550), 'player', 'escort', target.id, sourceVelocity);
				if ('height' in solution) { const shot = state.shots.at(-1); if (shot) shot.originHeight = solution.height; }
				escort.cooldown = config.reload;
			}
		}
	}
	for (const enemy of [...state.enemies]) {
		if (enemy.hp <= 0) continue;
		const config = ENEMIES[enemy.kind]; enemy.cooldown -= dt;
		const smallCraft = !isCapital(enemy);
		const defense = enemy.defense;
		if (defense && state.systems.distanceTraveled > defense.distance + VOYAGE_DEFENSE.passDistance) defense.disengaged = true;
		const defending = defense !== undefined && !defense.disengaged && distance(state.ark, defense.anchor) <= VOYAGE_DEFENSE.engageRange;
		if (enemy.launchRemaining !== undefined && enemy.launchRemaining > 0 && enemy.flight) {
			const next = { x: enemy.x + Math.cos(enemy.flight.angle) * enemy.flight.speed * dt, y: enemy.y + Math.sin(enemy.flight.angle) * enemy.flight.speed * dt };
			const field = state.systems.interdiction.field;
			if (!field || !circleHit(enemy, next, field.world, enemyClearance(enemy))) {
				enemy.launchRemaining = Math.max(0, enemy.launchRemaining - dt);
				enemy.x = next.x; enemy.y = next.y;
			}
			continue;
		}
		const escort = nearest(enemy, state.escorts.filter(function (craft) { return craft.hp > 0; }), tactical(180));
		const relative = localPoint(state, enemy);
		const arkTarget = worldPoint(state, { x: Math.max(-110, Math.min(110, relative.x)), y: Math.max(-30, Math.min(30, relative.y)), z: DECK_ALTITUDE });
		const destination = escort ?? arkTarget;
		enemy.flight ??= createFlight(relative, defense ? { x: 0, y: defense.anchor.y < state.routeOrigin.y ? 1 : -1 } : { x: state.ark.x - enemy.x, y: state.ark.y - enemy.y }, defense ? 0 : config.speed, enemy.id);
		const flight = enemy.flight;
		const approaching = enemy.approaching === true && distance(enemy, state.ark) > SENSOR_CONFIG.shortRange;
		if (!approaching && enemy.approaching) enemy.approaching = false;
		const flightSpeed = approaching ? APPROACH.cruiseSpeed * (isCapital(enemy) ? CAPITAL_SPEED_SCALE : smallCraft ? SMALL_CRAFT_SPEED_SCALE : 1) : config.speed;
		const hold = defense && (isCapital(enemy) || !defending) ? defense.anchor : undefined;
		const waypoint = navigateField(state, enemy, hold ?? destination, flightSpeed, dt);
		const desired = waypoint ? arriveCourse(enemy, waypoint, { x: 0, y: 0 }, 2)
			: hold ? arriveCourse(enemy, hold, { x: 0, y: 0 }, 0.5)
			: approaching ? arriveCourse(enemy, destination, carrierVelocity, 0.5)
			: isCapital(enemy) ? capitalCourse(state, enemy, flight, config.range, config.speed)
			: fighterCourse(enemy, escort ?? state.ark, tactical(escort ? 60 : enemy.kind === 'bomber' ? 265 : 195), tactical(escort ? 60 : enemy.kind === 'bomber' ? 225 : 105), config.speed, enemy.id % 2 ? -1 : 1, escort ? flightVelocity(escort.flight) : carrierVelocity, state.enemies);
		desired.z = (altitudeCourse(enemy.id, state.time, isCapital(enemy), escort ?? (isCapital(enemy) ? state.ark : { ...state.ark, z: -45 })) - (enemy.z ?? 0)) * 0.8;
		const hull = neighbors.find(function (hull) { return hull.id === enemy.id; });
		fly(enemy, flight, hull ? avoidTraffic(hull, desired, neighbors, flightSpeed) : desired, flightSpeed, isCapital(enemy) ? 0.7 : 3, dt, !isCapital(enemy), false, isCapital(enemy) ? flightSpeed / CAPITAL_SPEED_SCALE : flightSpeed, smallCraft ? SMALL_CRAFT_SPEED_SCALE : 1);
		if (defense && !defending) { delete enemy.bomberAttack; continue; }
		if (enemy.kind === 'carrier') { advanceCarrierHangar(state, enemy, flight, dt); continue; }
		const shotSpeed = tactical(enemy.kind === 'bomber' ? 155 : 235);
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
	resolveTraffic(state);
	let arkHit = false;
	for (const shot of state.shots) {
		if (shot.weapon === 'beam') continue;
		const before: Point = { x: shot.x, y: shot.y, ...(shot.z === undefined ? {} : { z: shot.z }) }; shot.life -= dt;
		if (shot.weapon === 'missile') {
			const target = state.enemies.find(function (e) { return e.id === shot.target && e.hp > 0 && canAcquire(state, e); });
			if (target) { const d = Math.max(0.001, distance(target, shot)); shot.vx = (target.x - shot.x) / d * WEAPONS.missile.speed + (shot.sourceVelocity?.x ?? 0); shot.vy = (target.y - shot.y) / d * WEAPONS.missile.speed + (shot.sourceVelocity?.y ?? 0); shot.vz = ((target.z ?? 0) - (shot.z ?? 0)) / d * WEAPONS.missile.speed + (shot.sourceVelocity?.z ?? 0); }
		}
		shot.x += shot.vx * dt; shot.y += shot.vy * dt; if (shot.z !== undefined) shot.z += (shot.vz ?? 0) * dt;
		if (shot.side === 'player') {
			const hit = state.enemies.find(function (enemy) { return enemy.hp > 0 && movingContact(enemy, previousEnemies.get(enemy.id) ?? enemy, before, shot, enemyRadius(enemy.kind)); });
			if (!hit) continue;
			shot.life = 0;
			if (shot.weapon === 'missile') { for (const enemy of state.enemies) if (distance(hit, enemy) < MISSILE_SPLASH_RADIUS) { enemyFeedback(state, enemy, shot.damage, shot.weapon); damageEnemy(enemy, shot.damage, shot.weapon); } effect(state, hit, MISSILE_SPLASH_RADIUS, '#f9c875'); }
			else { enemyFeedback(state, hit, shot.damage, shot.weapon); damageEnemy(hit, shot.damage, shot.weapon); effect(state, hit, 10, '#a6efe5'); }
		} else {
			const center = state.systems.interdiction.field?.world;
			const blocked = center ? circleHit(before, shot, center, INTERDICTION_CONFIG.radius) : undefined;
			if (blocked) {
				if (shot.z !== undefined) {
					const travel = Math.hypot(shot.x - before.x, shot.y - before.y);
					const fraction = travel > 0 ? Math.hypot(blocked.x - before.x, blocked.y - before.y) / travel : 1;
					blocked.z = (before.z ?? shot.z) + (shot.z - (before.z ?? shot.z)) * fraction;
				}
				effect(state, blocked, 20, '#d7bf89', shot); shot.life = 0; state.systems.interdiction.blockedShots++; continue;
			}
			const hit = state.escorts.find(function (escort) { return escort.hp > 0 && movingContact(escort, previousEscorts.get(escort.id) ?? escort, before, shot, (escort.kind === 'guardian' ? 20 : 12) * craftScale(escort.kind)); });
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
	for (const enemy of state.enemies) if (enemy.hp <= 0) { state.salvage += ENEMIES[enemy.kind].reward; state.kills += 1; state.effects.push({ x: enemy.x, y: enemy.y, z: enemy.z ?? 0, radius: enemy.kind === 'flagship' ? 95 : enemy.kind === 'armored' ? 38 : 24, life: 0.65, maxLife: 0.65, color: '#ffb87b', feedback: { kind: 'destruction' } }); }
	for (const escort of state.escorts) if (escort.hp <= 0) { state.escortLosses++; state.effects.push({ x: escort.x, y: escort.y, z: escort.z ?? 0, radius: 22, life: 0.65, maxLife: 0.65, color: '#81cfe7', feedback: { kind: 'destruction' } }); }
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
		const arrived = state.systems.distanceTraveled >= state.systems.routeLength;
		const complete = arrived && (!state.scenario || ((deadline !== undefined || state.time >= durationFor(state)) && combatResolved));
		if (complete) { state.status = 'won'; state.resultReason = 'arrival'; state.shots = []; }
	}
};
