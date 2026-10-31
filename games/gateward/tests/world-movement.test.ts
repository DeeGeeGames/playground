import { hullClearance, traffic } from '../src/ship-traffic';
import { describe, expect, test } from 'bun:test';
import { arkVelocity, localPoint, mountWorld, worldPoint } from '../src/space';
import { enemyClearance } from '../src/interdiction';
import { assignGuardian, build, createState, deploy, ENEMIES, placeInterdiction, scramble, setAllocation, setRally, step, type Escort, type Point, type State } from '../src/simulation';

const quiet = function (origin: Point = { x: 0, y: 0 }): State {
	const state = createState(); Object.assign(state.ark, origin); state.routeOrigin = { ...origin };
	state.status = 'running'; state.nextWave = Infinity; state.salvage = 1000;
	return state;
};
const advance = function (state: State, seconds: number): void { for (let i = 0; i < Math.round(seconds * 60); i++) step(state, 1 / 60); };
const followsHeading = function (state: State, craft: Escort, before: Point, beforeAngle: number, rate: number): void {
	const dx = craft.x - before.x; const dy = craft.y - before.y;
	const turn = Math.atan2(Math.sin(craft.angle - beforeAngle), Math.cos(craft.angle - beforeAngle));
	const speed = Math.hypot(dx, dy);
	const hulls = traffic(state); const hull = hulls.find(function (h) { return h.id === craft.id; });
	const touching = hull && hulls.some(function (other) { return other.id !== hull.id && hullClearance(hull, other).gap < 0.01; });
	if (speed > 1e-9 && !touching) {
		expect(Math.abs(dx * Math.sin(craft.angle) - dy * Math.cos(craft.angle))).toBeLessThan(1e-8);
		expect(dx * Math.cos(craft.angle) + dy * Math.sin(craft.angle)).toBeGreaterThan(0);
	}
	if (craft.flight) expect(Math.abs(turn)).toBeLessThanOrEqual(rate / 60 + 1e-8);
};

describe('one world and shared friendly steering', function () {
	test('guardian travels along its heading, matches ark course at station, and turns through reassignment', function () {
		const state = createState({ scenario: 'drill' }); state.status = 'running'; state.nextWave = Infinity;
		state.ark.x = 1400; state.routeOrigin.x = 1400; deploy(state, 'guardian');
		const guardian = state.escorts[0]; if (!guardian) throw new Error('Missing guardian');
		for (let frame = 0; frame < 1800; frame++) {
			if (frame === 600) assignGuardian(state, guardian.id, 'starboard');
			const before = { x: guardian.x, y: guardian.y }; const angle = guardian.angle;
			step(state, 1 / 60); followsHeading(state, guardian, before, angle, 1.6);
		}
		const offset = localPoint(state, guardian);
		expect(offset.y).toBeCloseTo(230, 0); expect(offset.x).toBeCloseTo(0, 0);
		expect(Math.cos(guardian.angle)).toBeGreaterThan(0.99);
		expect(guardian.flight?.speed).toBeCloseTo(state.ark.speed, 1);
	});
	test('fighters launch, form up, return to the moving stern and rearm without snapping their hulls', function () {
		const state = createState({ scenario: 'drill' }); state.status = 'running'; state.nextWave = Infinity;
		state.ark.x = 800; state.routeOrigin.x = 800; setAllocation(state, { engines: 10, weapons: 0, shields: 0 });
		state.coverage.enabled = false; // Exercise the explicit launch API independently of automatic radar orders.
		deploy(state, 'interceptor'); const wing = state.wings[0]; if (!wing) throw new Error('Missing wing');
		scramble(state, wing.id, 'port'); const phases = new Set<string>();
		for (let frame = 0; frame < 3000; frame++) {
			const before = new Map(state.escorts.map(function (craft) { return [craft.id, { x: craft.x, y: craft.y, angle: craft.angle }] as const; }));
			phases.add(wing.phase); step(state, 1 / 60);
			for (const craft of state.escorts) { const previous = before.get(craft.id); if (previous) followsHeading(state, craft, previous, previous.angle, 4); }
		}
		expect([...phases]).toEqual(['launching', 'sortie', 'returning', 'rearming', 'ready']);
		expect(state.escorts).toHaveLength(0); expect(wing.craft).toHaveLength(3);
		for (const craft of wing.craft) { expect(localPoint(state, craft).x).toBeCloseTo(-110); expect(localPoint(state, craft).y).toBeCloseTo(0); }
	});
	test('world orders and late deployment use the moving ark, including a rotated local anchor', function () {
		const state = quiet({ x: 2000, y: -800 }); state.ark.angle = Math.PI / 2;
		expect(setRally(state, worldPoint(state, { x: 120, y: -200 }))).toBe(true);
		expect(state.rally.x).toBeCloseTo(120); expect(state.rally.y).toBeCloseTo(-200);
		deploy(state, 'guardian'); const guardian = state.escorts[0]; if (!guardian) throw new Error('Missing guardian');
		expect(localPoint(state, guardian).x).toBeCloseTo(-220);
		advance(state, 12); expect(guardian.y).toBeGreaterThan(-700);
		expect(localPoint(state, guardian).x).toBeCloseTo(165, 0);
		expect(localPoint(state, guardian).y).toBeCloseTo(-200, 0);
	});
});

describe('world combat and anchoring', function () {
	for (const kind of ['raider', 'bomber', 'armored', 'flagship'] as const) test(`${kind} can brake and turn clear of a field placed just outside its hull`, function () {
		const state = quiet(); setAllocation(state, { engines: 0, weapons: 0, shields: 10 });
		const center = { x: 300, y: 0 }; const distance = enemyClearance({ kind }) + 1;
		const enemy = { id: state.nextId++, kind, x: 300, y: -distance, hp: 100000, maxHp: 100000, cooldown: 999, flight: { angle: Math.PI / 2, speed: ENEMIES[kind].speed, side: -1 as const, course: 'intercept' as const, run: 1 as const } };
		state.enemies.push(enemy); expect(placeInterdiction(state, center)).toBe(true);
		for (let frame = 0; frame < 1800; frame++) { step(state, 1 / 60); expect(Math.hypot(enemy.x - center.x, enemy.y - center.y)).toBeGreaterThanOrEqual(enemyClearance(enemy) - 12 - 1e-8); }
	});
	test('a ballistic round inherits launch velocity once and ignores later engine changes', function () {
		const state = quiet({ x: 3000, y: -500 }); build(state, 0, 'flak');
		const mount = state.mounts[0]; if (!mount) throw new Error('Missing mount');
		const contact = worldPoint(state, { x: mount.x, y: -240 });
		state.enemies.push({ id: state.nextId++, kind: 'armored', ...contact, hp: 10000, maxHp: 10000, cooldown: 999 });
		step(state, 1 / 60); const shot = state.shots.find(function (shot) { return shot.weapon === 'flak'; });
		if (!shot || !shot.origin || !shot.sourceVelocity) throw new Error('Missing launch record');
		expect(shot.origin).toEqual(mountWorld(state, mount)); expect(shot.sourceVelocity).toEqual(arkVelocity(state));
		const before = { x: shot.x, y: shot.y, vx: shot.vx, vy: shot.vy, origin: { ...shot.origin } };
		state.enemies = []; setAllocation(state, { engines: 0, weapons: 0, shields: 10 }); step(state, 0.05);
		expect(shot.vx).toBe(before.vx); expect(shot.vy).toBe(before.vy); expect(shot.origin).toEqual(before.origin);
		expect(shot.x).toBeCloseTo(before.x + before.vx * 0.05); expect(shot.y).toBeCloseTo(before.y + before.vy * 0.05);
	});
	test('fixed fields and rounds remain in the world when the ark passes them', function () {
		const state = quiet({ x: 2000, y: 400 }); const position = worldPoint(state, { x: 300, y: 0 });
		expect(placeInterdiction(state, position)).toBe(true);
		const field = state.systems.interdiction.field; if (!field) throw new Error('Missing field');
		state.shots.push({ id: state.nextId++, x: 1900, y: 200, vx: 0, vy: 0, damage: 1, side: 'enemy', weapon: 'hostile', target: undefined, life: 4 });
		advance(state, 2); expect(field.world).toEqual(position); expect(state.ark.x).toBeCloseTo(2024);
		expect(state.shots[0]?.x).toBe(1900); expect(state.shots[0]?.y).toBe(200);
	});
	test('moving hull contact is swept even when a fast round crosses the entire ark in one tick', function () {
		const state = quiet({ x: 2500, y: 200 }); state.shots.push({ id: state.nextId++, x: 2300, y: 200, vx: 10000, vy: 0, damage: 20, side: 'enemy', weapon: 'hostile', target: undefined, life: 4 });
		step(state, 0.05); expect(state.shots).toHaveLength(0); expect(state.systems.shieldAbsorbed).toBe(20);
		const effect = state.effects.find(function (effect) { return effect.radius === 22; });
		expect(effect?.x).toBeGreaterThanOrEqual(2355); expect(effect?.x).toBeLessThan(2356);
	});
	test('translating the whole encounter preserves flight, damage, sensor intel and field interaction', function () {
		const scene = function (origin: Point): State {
			const state = quiet(origin); build(state, 0, 'rail'); deploy(state, 'guardian'); deploy(state, 'interceptor');
			placeInterdiction(state, worldPoint(state, { x: 300, y: 0 }));
			for (const [index, kind] of (['raider', 'armored', 'bomber'] as const).entries()) state.enemies.push({ id: state.nextId++, kind, ...worldPoint(state, { x: 600, y: (index - 1) * 100 }), hp: 5000, maxHp: 5000, cooldown: 0 });
			return state;
		};
		const base = scene({ x: 0, y: 0 }); const translated = scene({ x: 10000, y: -3000 }); advance(base, 20); advance(translated, 20);
		expect(translated.hull).toBeCloseTo(base.hull); expect(translated.systems.shieldAbsorbed).toBeCloseTo(base.systems.shieldAbsorbed);
		expect(translated.kills).toBe(base.kills); expect(translated.systems.interdiction.redirected).toBe(base.systems.interdiction.redirected);
		for (const craft of [...base.enemies, ...base.escorts]) {
			const other = [...translated.enemies, ...translated.escorts].find(function (candidate) { return candidate.id === craft.id; });
			if (!other) throw new Error('Translation changed craft existence');
			expect(other.x - translated.ark.x).toBeCloseTo(craft.x - base.ark.x, 2); expect(other.y - translated.ark.y).toBeCloseTo(craft.y - base.ark.y, 2); expect(other.hp).toBeCloseTo(craft.hp);
		}
	});
});
