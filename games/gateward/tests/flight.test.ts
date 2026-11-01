import { tactical } from '../src/combat-scale';
import { CRAFT_MOUNTS } from '../src/craft-turrets';
import { describe, expect, test } from 'bun:test';
import { broadsideMuzzle, fly, type Flight } from '../src/flight';
import { flightVelocity, localPoint } from '../src/space';
import { createState, deploy, scramble, ENEMIES, ESCORTS, APPROACH, setAllocation, setRally, step, type Enemy, type EnemyKind, type State } from '../src/simulation';

const quiet = function (): State {
	const state = createState(); state.status = 'running'; state.nextWave = Infinity;
	state.systems.shield.capacity = 100000; state.systems.shield.charge = 100000;
	return state;
};
const hostile = function (state: State, kind: EnemyKind, x: number, y: number): Enemy {
	const enemy: Enemy = { id: state.nextId++, kind, x, y, hp: 100000, maxHp: 100000, cooldown: 0 };
	state.enemies.push(enemy); return enemy;
};
const advance = function (state: State, seconds: number): void { for (let i = 0; i < Math.round(seconds * 60); i++) step(state, 1 / 60); };

describe('capital ship courses and batteries', function () {
	for (const kind of ['carrier', 'armored', 'flagship'] as const) {
		for (const approaching of [false, true]) test(`${kind} respects its reduced world-speed cap (approaching=${approaching})`, function () {
			const state = quiet(); const enemy = hostile(state, kind, -5000, 0);
			enemy.approaching = approaching;
			enemy.flight = { angle: 0, speed: 0, side: -1, course: 'intercept', run: 1 };
			const oldSpeed = kind === 'carrier' ? tactical(38) : kind === 'armored' ? tactical(40) : tactical(36);
			const limit = (approaching ? APPROACH.cruiseSpeed : oldSpeed) * 0.125;
			let peakSpeed = 0;
			for (let frame = 0; frame < 600; frame++) {
				const before = { x: enemy.x, y: enemy.y, z: enemy.z ?? 0 }; step(state, 1 / 60);
				const speed = Math.hypot(enemy.x - before.x, enemy.y - before.y, (enemy.z ?? 0) - before.z) * 60;
				expect(speed).toBeLessThanOrEqual(limit + 1e-8); peakSpeed = Math.max(peakSpeed, speed);
			}
			expect(peakSpeed).toBeGreaterThan(limit * 0.9);
			if (!approaching) expect(localPoint(state, enemy).x).toBeLessThan(-5000);
		});
	}

	for (const kind of ['armored', 'flagship'] as const) for (const start of [{ x: 520, y: 0 }, { x: -520, y: 0 }, { x: 0, y: -460 }, { x: 0, y: 460 }]) {
		test(`${kind} intercepts from (${start.x}, ${start.y}), maneuvers and fires broadsides beside a stationary ark`, function () {
			const state = quiet(); setAllocation(state, { engines: 0, weapons: 10, shields: 0 });
			const enemy = hostile(state, kind, start.x, start.y);
			// Reduced thrust and early braking need a longer approach.
			advance(state, 110);
			expect(enemy.flight?.course).toBe('broadside');
			const absorbed = state.systems.shieldAbsorbed;
			for (let frame = 0; frame < 480; frame++) {
				const before = { x: enemy.x, y: enemy.y, z: enemy.z ?? 0 }; step(state, 1 / 60);
				expect(Math.hypot(enemy.x - before.x, enemy.y - before.y, (enemy.z ?? 0) - before.z)).toBeLessThanOrEqual(ENEMIES[kind].speed / 60 + 1e-8);
			}
			expect(state.systems.shieldAbsorbed).toBeGreaterThan(absorbed);
			expect(Math.abs(enemy.y)).toBeGreaterThan(100);
		});
	}
	test('side banks fire from the presented hull edge and reject bow/stern targets', function () {
		const state = quiet(); const enemy = hostile(state, 'armored', 0, -160);
		enemy.flight = { angle: 0, speed: 20, side: -1, course: 'broadside', run: 1 };
		expect(broadsideMuzzle(enemy, { x: 0, y: 0 })).toEqual({ x: -10, y: -140 });
		expect(broadsideMuzzle(enemy, { x: 0, y: -300 })).toEqual({ x: -10, y: -180 });
		expect(broadsideMuzzle(enemy, { x: 200, y: -160 })).toBeUndefined();
		expect(broadsideMuzzle(enemy, { x: -200, y: -160 })).toBeUndefined();
		step(state, 1 / 60); const shot = state.shots.find(function (shot) { return shot.side === 'enemy'; });
		if (!shot) throw new Error('Missing broadside');
		const dx = shot.x - shot.vx / 60 - enemy.x; const dy = shot.y - shot.vy / 60 - enemy.y;
		const angle = enemy.flight.angle;
		const aim = enemy.turretAim;
		if (!aim) throw new Error('Missing turret aim');
		const mount = CRAFT_MOUNTS.armored[aim.mount];
		if (!mount) throw new Error('Missing mount');
		expect(-Math.sin(angle) * dx + Math.cos(angle) * dy).toBeCloseTo(1.5 * (mount.y + Math.sin(aim.angle) * mount.barrel));
	});
	test('leading a crossing escort cannot turn a broadside into a bow shot', function () {
		const state = quiet(); const enemy = hostile(state, 'armored', 0, -160);
		enemy.flight = { angle: 0, speed: 20, side: -1, course: 'broadside', run: 1 };
		state.escorts.push({ id: state.nextId++, kind: 'guardian', x: 90, y: -80, hp: 100000, cooldown: 999, angle: 0 });
		setRally(state, { x: 400, y: -80 });
		step(state, 1 / 60);
		const shot = state.shots.find(function (shot) { return shot.side === 'enemy'; });
		if (!shot) throw new Error('Missing fallback broadside');
		// The escort's current bearing is in arc, but its predicted interception
		// point is ahead of the bank. The ark remains a legal broadside target.
		expect(shot.target).toBeUndefined();
		const direction = Math.atan2(shot.vy - (shot.sourceVelocity?.y ?? 0), shot.vx - (shot.sourceVelocity?.x ?? 0)) - enemy.flight.angle;
		expect(Math.abs(Math.cos(direction))).toBeLessThanOrEqual(Math.sin(50 * Math.PI / 180));
	});
	for (const engines of [0, 10]) test(`world speed stays bounded through engine changes and gate arrival (${engines} engines)`, function () {
		const state = quiet(); const enemy = hostile(state, 'flagship', -300, -400);
		for (let frame = 0; frame < 3600; frame++) {
			if (frame === 600) setAllocation(state, { engines, weapons: 10 - engines, shields: 0 });
			if (frame === 1800) { state.systems.distanceTraveled = state.systems.routeLength; state.ark.x = state.routeOrigin.x + state.systems.routeLength; }
			const before = { x: enemy.x, y: enemy.y };
			step(state, 1 / 60);
			const worldX = enemy.x - before.x;
			expect(Math.hypot(worldX, enemy.y - before.y)).toBeLessThanOrEqual(ENEMIES.flagship.speed / 60 + 1e-8);
		}
		const before = { x: enemy.x, y: enemy.y }; advance(state, 5);
		expect(Math.hypot(enemy.x - before.x, enemy.y - before.y)).toBeGreaterThan(20);
	});
});

describe('fighter skirmishing', function () {
	for (const kind of ['raider', 'bomber'] as const) for (const approaching of [false, true]) test(`${kind} uses 12.5% speed, thrust and yaw acceleration (approaching=${approaching})`, function () {
		const state = quiet(); const enemy = hostile(state, kind, -5000, 0);
		enemy.approaching = approaching;
		enemy.flight = { angle: 0, speed: 0, side: 1, course: 'intercept', run: 1 };
		const limit = (approaching ? APPROACH.cruiseSpeed : tactical(kind === 'raider' ? 50 : 30)) * 0.125;
		let peak = 0;
		for (let frame = 0; frame < 600; frame++) {
			const before = { x: enemy.x, y: enemy.y, z: enemy.z ?? 0 }; step(state, 1 / 60);
			const speed = Math.hypot(enemy.x - before.x, enemy.y - before.y, (enemy.z ?? 0) - before.z) * 60;
			expect(speed).toBeLessThanOrEqual(limit + 1e-8); peak = Math.max(peak, speed);
			if (frame === 0) {
				expect(speed).toBeCloseTo(limit * 0.65 / 60);
				expect(Math.abs(enemy.flight.angularVelocity ?? 0)).toBeLessThanOrEqual(3 * 0.8 * 0.125 / 60 + 1e-8);
				if (!approaching) expect(Math.abs(enemy.flight.angularVelocity ?? 0)).toBeCloseTo(3 * 0.8 * 0.125 / 60);
			}
		}
		expect(peak).toBeGreaterThan(limit * 0.9);
	});

	test('interceptor thrust, braking and yaw acceleration scale to 12.5%', function () {
		const original: Flight = { angle: 0, speed: 0, side: 1, course: 'intercept', run: 1 };
		const slower = structuredClone(original);
		fly({ x: 0, y: 0 }, original, { x: 1000, y: 1000, z: 20 }, 640, 4, 1 / 60, true);
		fly({ x: 0, y: 0 }, slower, { x: 1000, y: 1000, z: 20 }, ESCORTS.interceptor.speed, 4, 1 / 60, true, false, ESCORTS.interceptor.speed, 0.125);
		const before = flightVelocity(original); const after = flightVelocity(slower);
		expect(Math.hypot(after.x, after.y, after.z ?? 0)).toBeCloseTo(Math.hypot(before.x, before.y, before.z ?? 0) * 0.125);
		expect(slower.angularVelocity).toBeCloseTo((original.angularVelocity ?? 0) * 0.125);
		const braking: Flight = { angle: 0, speed: 80, vx: 80, vy: 0, vz: 0, side: 1, course: 'intercept', run: 1 };
		fly({ x: 0, y: 0 }, braking, { x: 0, y: 0 }, ESCORTS.interceptor.speed, 4, 1 / 60, true, false, ESCORTS.interceptor.speed, 0.125);
		expect(80 - braking.speed).toBeCloseTo(640 * 0.65 * 0.125 / 60);
	});

	test('a deployed interceptor wing observes its 80 m/s speed ceiling', function () {
		const state = quiet(); deploy(state, 'interceptor'); const wing = state.wings[0]; if (!wing) throw new Error('Missing wing');
		scramble(state, wing.id, 'port'); let peak = 0;
		for (let frame = 0; frame < 600; frame++) {
			const before = state.escorts.map(function (craft) { return { id: craft.id, x: craft.x, y: craft.y, z: craft.z ?? 0 }; });
			step(state, 1 / 60);
			for (const craft of state.escorts) {
				const start = before.find(function (point) { return point.id === craft.id; }); if (!start) throw new Error('Missing craft position');
				const speed = Math.hypot(craft.x - start.x, craft.y - start.y, (craft.z ?? 0) - start.z) * 60;
				expect(speed).toBeLessThanOrEqual(80 + 1e-8); peak = Math.max(peak, speed);
			}
		}
		expect(peak).toBeGreaterThan(72);
	});

	for (const kind of ['raider', 'bomber'] as const) test(`${kind} keeps moving around the ark and takes repeated pot shots`, function () {
		const state = quiet();
		// Keep full-orbit stability independent of the ark's forward travel.
		setAllocation(state, { engines: 0, weapons: 10, shields: 0 });
		const enemy = hostile(state, kind, tactical(400), -tactical(100));
		advance(state, 20); const before = { x: enemy.x, y: enemy.y }; const absorbed = state.systems.shieldAbsorbed;
		const quadrants = new Set<string>();
		const orbitFrames = kind === 'bomber' ? 38400 : 9600;
		for (let i = 0; i < orbitFrames; i++) { step(state, 1 / 60); const relative = localPoint(state, enemy); quadrants.add(`${Math.sign(relative.x)},${Math.sign(relative.y)}`); }
		expect(quadrants.size).toBe(4); expect(state.systems.shieldAbsorbed).toBeGreaterThan(absorbed);
		expect(Math.hypot(enemy.x - before.x, enemy.y - before.y)).toBeGreaterThan(30);
	});
	test('hostile and deployed interceptors maneuver, exchange fire, and resume ark attacks after escorts disappear', function () {
		const state = quiet(); setAllocation(state, { engines: 0, weapons: 10, shields: 0 }); deploy(state, 'interceptor'); const wing = state.wings[0]; if (!wing) throw new Error('Missing wing'); scramble(state, wing.id, 'port');
		for (const escort of state.escorts) { escort.hp = 100000; escort.x = 0; escort.y = -tactical(150); }
		const enemy = hostile(state, 'raider', tactical(60), -tactical(220)); const before = structuredClone(state.escorts);
		let hostileShots = 0; let friendlyShots = 0;
		for (let frame = 0; frame < 600; frame++) {
			const nextId = state.nextId; step(state, 1 / 60);
			for (const shot of state.shots.filter(function (shot) { return shot.id >= nextId; })) {
				if (shot.side === 'enemy' && shot.target !== undefined) hostileShots++;
				if (shot.side === 'player') friendlyShots++;
			}
		}
		expect(hostileShots).toBeGreaterThan(2); expect(friendlyShots).toBeGreaterThan(5);
		expect(enemy.hp).toBeLessThan(100000);
		expect(state.escorts.some(function (craft, index) { const start = before[index]; return start && Math.hypot(craft.x - start.x, craft.y - start.y) > 30; })).toBe(true);
		state.escorts = []; const absorbed = state.systems.shieldAbsorbed; advance(state, 180);
		expect(state.systems.shieldAbsorbed).toBeGreaterThan(absorbed);
	});
	test('courses repeat deterministically and pause, focus loss and results freeze all flight state', function () {
		const state = quiet(); hostile(state, 'raider', 350, -100); hostile(state, 'armored', -500, 100);
		advance(state, 5); const repeat = structuredClone(state); advance(state, 20); advance(repeat, 20); expect(repeat).toEqual(state);
		for (const restriction of ['paused', 'unfocused', 'won', 'lost'] as const) {
			const frozen = structuredClone(state);
			if (restriction === 'paused') frozen.paused = true; else if (restriction === 'unfocused') frozen.focused = false; else frozen.status = restriction;
			const snapshot = structuredClone(frozen); advance(frozen, 3); expect(frozen).toEqual(snapshot);
		}
	});
});

describe('small-craft inertia', function () {
	const flight = function (speed = 0): Flight { return { angle: 0, speed, side: 1, course: 'intercept', run: 1 }; };
	test('builds speed and brakes over time instead of stopping on command', function () {
		const point = { x: 0, y: 0 }; const craft = flight();
		fly(point, craft, { x: 100, y: 0 }, 100, 3, 1 / 60, true);
		expect(craft.speed).toBeGreaterThan(0); expect(craft.speed).toBeLessThan(2);
		for (let i = 0; i < 180; i++) fly(point, craft, { x: 100, y: 0 }, 100, 3, 1 / 60, true);
		expect(craft.speed).toBeCloseTo(100);
		const before = point.x;
		fly(point, craft, { x: 0, y: 0 }, 100, 3, 1 / 60, true);
		expect(point.x).toBeGreaterThan(before); expect(craft.speed).toBeGreaterThan(98);
		for (let i = 0; i < 180; i++) fly(point, craft, { x: 0, y: 0 }, 100, 3, 1 / 60, true);
		expect(craft.speed).toBeCloseTo(0);
	});

	test('retains incoming momentum through a turn, with bounded thrust and yaw acceleration', function () {
		const point = { x: 0, y: 0 }; const craft = flight(100);
		let previousVelocity = flightVelocity(craft); let previousYaw = 0;
		for (let i = 0; i < 240; i++) {
			fly(point, craft, { x: 0, y: 100, z: 10 }, 100, 3, 1 / 60, true);
			const velocity = flightVelocity(craft); const yaw = craft.angularVelocity ?? 0;
			expect(Math.hypot(velocity.x - previousVelocity.x, velocity.y - previousVelocity.y, (velocity.z ?? 0) - (previousVelocity.z ?? 0))).toBeLessThanOrEqual(65 / 60 + 1e-8);
			expect(Math.abs(yaw - previousYaw)).toBeLessThanOrEqual(2.4 / 60 + 1e-8);
			expect(Math.hypot(velocity.x, velocity.y, velocity.z ?? 0)).toBeLessThanOrEqual(100 + 1e-8);
			if (i === 29) {
				expect(velocity.x).toBeGreaterThan(60);
				expect(Math.abs(Math.atan2(velocity.y, velocity.x) - craft.angle)).toBeGreaterThan(0.1);
			}
			previousVelocity = velocity; previousYaw = yaw;
		}
		expect(craft.angle).toBeCloseTo(Math.PI / 2, 1);
		expect(previousVelocity.y).toBeGreaterThan(90);
		expect(Math.abs(previousYaw)).toBeLessThan(0.02);
	});

	test('arrives at a stationary order without sustained circling', function () {
		const point = { x: -300, y: -100 }; const craft = flight(80);
		for (let i = 0; i < 1800; i++) fly(point, craft, { x: -point.x * 1.5, y: -point.y * 1.5 }, 100, 3, 1 / 60, true);
		expect(Math.hypot(point.x, point.y)).toBeLessThan(1);
		expect(craft.speed).toBeLessThan(1);
	});
});


describe('heavy hull response', function () {
	test('Guardian inherits no excess ark speed and stays within its eighth-speed ceiling', function () {
		const state = quiet(); setAllocation(state, { engines: 10, weapons: 0, shields: 0 });
		step(state, 1 / 60); deploy(state, 'guardian');
		const guardian = state.escorts[0]; if (!guardian) throw new Error('Missing Guardian');
		const arkStart = state.ark.x; const before = localPoint(state, guardian).x;
		for (let frame = 0; frame < 600; frame++) {
			step(state, 1 / 60);
			const velocity = flightVelocity(guardian.flight);
			expect(Math.hypot(velocity.x, velocity.y, velocity.z ?? 0)).toBeLessThanOrEqual(42.5 + 1e-8);
		}
		expect(localPoint(state, guardian).x).toBeLessThan(before);
		expect(state.ark.x - arkStart).toBeCloseTo(600, 5);
	});

	test('Guardian thrust, braking, yaw and pitch retain one quarter of their former acceleration', function () {
		const craft: Flight = { angle: 0, speed: 0, side: 1, course: 'intercept', run: 1 };
		fly({ x: 0, y: 0 }, craft, { x: 100, y: 100, z: 20 }, ESCORTS.guardian.speed, 1.6, 1 / 60, true, true, 85);
		const velocity = flightVelocity(craft);
		expect(Math.hypot(velocity.x, velocity.y, velocity.z ?? 0)).toBeCloseTo(340 * 0.45 * 0.25 / 60);
		expect(craft.angularVelocity).toBeCloseTo(1.6 * 0.5 * 0.25 / 60);
		expect(craft.pitchVelocity).toBeCloseTo(0.12 * 0.25 / 60);
		const braking: Flight = { angle: 0, speed: 42.5, vx: 42.5, vy: 0, vz: 0, side: 1, course: 'intercept', run: 1 };
		fly({ x: 0, y: 0 }, braking, { x: 0, y: 0 }, ESCORTS.guardian.speed, 1.6, 1 / 60, true, true, 85);
		expect(braking.speed).toBeCloseTo(42.5 - 340 * 0.45 * 0.25 / 60);
	});

	test('lowering a capital speed ceiling preserves its thrust acceleration', function () {
		const original: Flight = { angle: 0, speed: 0, side: 1, course: 'intercept', run: 1 };
		const slower = structuredClone(original);
		fly({ x: 0, y: 0 }, original, { x: 1000, y: 0, z: 10 }, 160, 0.7, 1 / 60);
		fly({ x: 0, y: 0 }, slower, { x: 1000, y: 0, z: 10 }, 40, 0.7, 1 / 60, false, false, 160);
		expect(slower.speed).toBeCloseTo(original.speed);
		expect(slower.vz).toBeCloseTo(original.vz ?? 0);
	});

	test('capital rotation brakes before reaching its commanded bearing', function () {
		const craft: Flight = { angle: 0, speed: 0, side: 1, course: 'intercept', run: 1 };
		const point = { x: 0, y: 0 };
		let brakingAngle: number | undefined;
		for (let frame = 0; frame < 1800; frame++) {
			const previousYaw = craft.angularVelocity ?? 0;
			fly(point, craft, { x: 0, y: 100 }, 100, 0.7, 1 / 60);
			if (brakingAngle === undefined && (craft.angularVelocity ?? 0) < previousYaw) brakingAngle = craft.angle;
			expect(craft.angle).toBeLessThanOrEqual(Math.PI / 2 + 0.001);
		}
		if (brakingAngle === undefined) throw new Error('Capital never began braking');
		expect(brakingAngle).toBeLessThan(Math.PI / 3);
		expect(craft.angle).toBeCloseTo(Math.PI / 2, 2);
	});

	test('capital thrust, braking, climb, yaw and pitch use quarter acceleration', function () {
		const craft: Flight = { angle: 0, speed: 0, side: 1, course: 'intercept', run: 1 };
		fly({ x: 0, y: 0 }, craft, { x: 100, y: 0, z: 30 }, 100, 0.7, 1 / 60);
		expect(craft.speed).toBeCloseTo(45 * 0.25 / 60);
		expect(craft.vz).toBeCloseTo(20 * 0.25 / 60);
		expect(craft.pitchVelocity).toBeCloseTo(0.12 * 0.25 / 60);
		craft.speed = 100;
		fly({ x: 0, y: 0 }, craft, { x: 0, y: 100 }, 100, 0.7, 1 / 60);
		expect(craft.speed).toBeCloseTo(100 - 45 * 0.25 / 60);
		expect(craft.angularVelocity).toBeCloseTo(0.7 * 0.35 * 0.25 / 60);
	});

	for (const inertial of [false, true]) test(`builds speed and both rotations gradually, then settles (inertial=${inertial})`, function () {
		const point = { x: 0, y: 0, z: 0 };
		const craft: Flight = { angle: 0, speed: 0, side: 1, course: 'intercept', run: 1 };
		fly(point, craft, { x: 100, y: 0 }, 100, 0.7, 1 / 60, inertial, true);
		expect(craft.speed).toBeGreaterThan(0);
		expect(craft.speed).toBeLessThan(1);
		for (let i = 0; i < 600; i++) fly(point, craft, { x: 100, y: 0 }, 100, 0.7, 1 / 60, inertial, true);
		expect(craft.speed).toBeCloseTo(100);
		for (let i = 0; i < 2400; i++) {
			const yaw = craft.angularVelocity ?? 0; const pitch = craft.pitchVelocity ?? 0;
			fly(point, craft, { x: 0, y: 100, z: i < 120 ? 30 : 0 }, 100, 0.7, 1 / 60, inertial, true);
			expect(Math.abs((craft.angularVelocity ?? 0) - yaw)).toBeLessThanOrEqual(0.7 * (inertial ? 0.5 : 0.35) * 0.25 / 60 + 1e-8);
			expect(Math.abs((craft.pitchVelocity ?? 0) - pitch)).toBeLessThanOrEqual(0.12 * 0.25 / 60 + 1e-8);
			expect(Math.hypot(craft.speed, craft.vz ?? 0)).toBeLessThanOrEqual(100 + 1e-8);
			if (i === 0) { expect(craft.angle).toBeLessThan(0.001); expect(Math.abs(craft.pitch ?? 0)).toBeLessThan(0.001); }
			if (i === 59) expect(craft.pitch).toBeGreaterThan(0.01);
		}
		expect(craft.angle).toBeCloseTo(Math.PI / 2, 2);
		expect(craft.pitch).toBeCloseTo(0, 2);
		expect(craft.angularVelocity).toBeCloseTo(0, 2);
		const before = point.y;
		fly(point, craft, { x: 0, y: 0 }, 100, 0.7, 1 / 60, inertial, true);
		expect(point.y).toBeGreaterThan(before);
		expect(craft.speed).toBeGreaterThan(99);
	});
});
