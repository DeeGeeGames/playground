import { tactical } from '../src/combat-scale';
import { describe, expect, test } from 'bun:test';
import { assignGuardian, build, covered, coverageFor, craftCount, createState, deploy, MAX_HULL, pulse, repair, replaceFighters, scramble, SECTOR_POINTS, step, upgrade, type State } from '../src/simulation';
import { localPoint, mountWorld, worldPoint } from '../src/space';
const advance = function (state: State, seconds: number) { for (let i = 0; i < Math.ceil(seconds * 60); i++) step(state, 1 / 60); };
const quiet = function () { const s = createState(); s.nextWave = Infinity; return s; };
const firstWing = function (s: State) { const w = s.wings[0]; if (!w) throw new Error('Missing wing'); return w; };

describe('directional coverage', function () {
	test('inclusive angular and range boundaries, opposite flanks, fore/aft blind spots and upgraded ranges', function () {
		const s = quiet(); s.salvage = 1000; build(s, 0, 'rail'); build(s, 4, 'rail');
		const port = s.mounts[0]; const starboard = s.mounts[4]; if (!port || !starboard) throw new Error('Missing mounts');
		const c = coverageFor(s, port);
		for (const sign of [-1, 1]) {
			const a = c.center + sign * c.arc / 2;
			expect(covered(s, port, { z: mountWorld(s, port).z ?? 0, x: port.x + Math.cos(a) * c.range, y: port.y + Math.sin(a) * c.range })).toBe(true);
			expect(covered(s, port, { x: port.x + Math.cos(a + sign * .001) * 100, y: port.y + Math.sin(a + sign * .001) * 100 })).toBe(false);
		}
		expect(covered(s, port, { x: port.x, y: 200 })).toBe(false);
		expect(covered(s, starboard, { x: starboard.x, y: -200 })).toBe(false);
		for (const x of [-300, 200]) { expect(covered(s, port, { x, y: 0 })).toBe(false); expect(covered(s, starboard, { x, y: 0 })).toBe(false); }
		const far = { x: port.x, y: port.y - tactical(450) }; expect(covered(s, port, far)).toBe(false); upgrade(s, 0); expect(covered(s, port, far)).toBe(true);
	});
	test('outward priority cannot bypass the opposite turret arc', function () {
		const s = quiet(); build(s, 0, 'rail'); build(s, 4, 'rail'); s.status = 'running';
		s.enemies.push({ id: 99, x: -96, y: 220, hp: 260, maxHp: 260, kind: 'armored', cooldown: 99 }); s.priority = 99;
		step(s, 1 / 60); expect(s.shots.filter(function (x) { return x.side === 'player'; })).toHaveLength(1); expect(s.shots[0]?.y).toBeGreaterThan(43);
	});
});

describe('wing resources and lifecycle', function () {
	test('ready reserves consume capacity; scramble is separate and repeated orders fail', function () {
		const s = quiet(); s.salvage = 1000; deploy(s, 'interceptor'); deploy(s, 'interceptor'); deploy(s, 'interceptor');
		expect(craftCount(s)).toBe(9); expect(s.escorts).toHaveLength(0); expect(deploy(s, 'guardian')).toBe(false); expect(s.salvage).toBe(745);
		const w = firstWing(s); expect(scramble(s, w.id, 'port')).toBe(false); s.status = 'running'; expect(scramble(s, w.id, 'port')).toBe(true); expect(scramble(s, w.id, 'astern')).toBe(false); expect(craftCount(s)).toBe(9);
	});
	test('launches from ark, flies, returns without firing, rearms and can launch again', function () {
		const s = quiet(); deploy(s, 'interceptor'); s.status = 'running'; const w = firstWing(s); scramble(s, w.id, 'port');
		expect(w.phase).toBe('launching'); expect(w.craft[0]?.x).toBe(-180); advance(s, 2.1); expect(w.phase).toBe('sortie');
		advance(s, 18); expect(w.phase).toBe('returning'); expect(s.shots).toHaveLength(0);
		for (let frame = 0; frame < 3600 && w.phase !== 'rearming'; frame++) step(s, 1 / 60);
		expect(w.phase).toBe('rearming'); expect(s.escorts).toHaveLength(0); expect(craftCount(s)).toBe(3);
		advance(s, 10); expect(w.phase).toBe('ready'); expect(scramble(s, w.id, 'ahead')).toBe(true); expect(s.launches).toBe(2);
	});
	test('returning fighters move home and cannot fire at nearby hostiles', function () {
		const s = quiet(); deploy(s, 'interceptor'); s.status = 'running'; const w = firstWing(s); scramble(s, w.id, 'port'); advance(s, 3); w.phase = 'returning';
		s.enemies.push({ id: 99, ...worldPoint(s, { x: 0, y: -250 }), hp: 2000, maxHp: 2000, kind: 'armored', cooldown: 99 });
		advance(s, .5); expect(s.shots.filter(function (shot) { return shot.side === 'player'; })).toHaveLength(0);
	});
	test('combat loss frees one slot without respawn; replacement costs 30 and requires ready', function () {
		const s = quiet(); deploy(s, 'interceptor'); s.status = 'running'; const w = firstWing(s); scramble(s, w.id, 'port');
		const craft = w.craft[0]; if (!craft) throw new Error('Missing craft');
		s.shots.push({ id: 999, x: craft.x, y: craft.y, vx: 0, vy: 0, damage: 100, side: 'enemy', weapon: 'hostile', target: craft.id, life: 2 });
		advance(s, .02); expect(s.escortLosses).toBe(1); expect(craftCount(s)).toBe(2); expect(replaceFighters(s, w.id)).toBe(false);
		for (let frame = 0; frame < 5400 && w.phase !== 'ready'; frame++) step(s, 1 / 60);
		expect(w.phase).toBe('ready'); expect(w.craft).toHaveLength(2); const before = s.salvage;
		expect(replaceFighters(s, w.id)).toBe(true); expect(s.salvage).toBe(before - 30); expect(craftCount(s)).toBe(3);
	});
	test('assignment remains bounded when a local target disappears; priority does not drag wings away', function () {
		const s = quiet(); deploy(s, 'interceptor'); s.status = 'running'; const w = firstWing(s); scramble(s, w.id, 'port');
		s.enemies.push({ id: 99, x: 0, y: 450, hp: 2000, maxHp: 2000, kind: 'armored', cooldown: 99 }); s.priority = 99; advance(s, 17);
		expect(w.craft.every(function (c) { return c.y < -180; })).toBe(true); s.enemies = []; for (let frame = 0; frame < 7200 && w.phase !== 'ready'; frame++) step(s, 1 / 60); expect(w.phase).toBe('ready');
	});
});

describe('guardian screens and restrictions', function () {
	test('independent assignments persist with physical travel and local leash', function () {
		const s = quiet(); deploy(s, 'guardian'); deploy(s, 'guardian'); const [a, b] = s.escorts; if (!a || !b) throw new Error('Missing guardians');
		assignGuardian(s, b.id, 'starboard'); s.status = 'running'; advance(s, 15); expect(a.y).toBeLessThan(-220); expect(b.y).toBeGreaterThan(220);
		assignGuardian(s, a.id, 'ahead'); const before = a.x; advance(s, .1); expect(a.x - before).toBeLessThan(10); advance(s, 30); expect(localPoint(s, a).x).toBeGreaterThan(270); expect(b.sector).toBe('starboard');
		s.enemies.push({ id: 99, ...worldPoint(s, { x: -400, y: 0 }), hp: 9999, maxHp: 9999, kind: 'armored', cooldown: 99 }); s.priority = 99; advance(s, 2); expect(localPoint(s, a).x).toBeGreaterThan(270);
	});
	test('screen draws hostile fire and dies without damaging ark; replacement uses economy', function () {
		const s = quiet(); deploy(s, 'guardian'); const g = s.escorts[0]; if (!g) throw new Error('Missing guardian'); Object.assign(g, SECTOR_POINTS.port); g.hp = 1; s.status = 'running';
		s.enemies.push({ id: 99, x: 0, y: -tactical(320), hp: 45, maxHp: 45, kind: 'raider', cooldown: 0 }); advance(s, 1); expect(s.escorts).toHaveLength(0); expect(s.hull).toBe(MAX_HULL); expect(s.escortLosses).toBe(1); expect(assignGuardian(s, g.id, 'ahead')).toBe(false);
		const before = s.salvage; expect(deploy(s, 'guardian')).toBe(true); expect(s.salvage).toBe(before - 105);
	});
	for (const restriction of ['paused', 'unfocused', 'won', 'lost'] as const) test(`${restriction} freezes simulation and rejects commands`, function () {
		const s = quiet(); s.salvage = 1000; deploy(s, 'interceptor'); deploy(s, 'guardian'); s.status = 'running'; const w = firstWing(s); const g = s.escorts[0]; if (!g) throw new Error('Missing guardian');
		if (restriction === 'paused') s.paused = true; else if (restriction === 'unfocused') s.focused = false; else s.status = restriction;
		const snapshot = JSON.stringify(s); advance(s, 5); expect(scramble(s, w.id, 'port')).toBe(false); expect(assignGuardian(s, g.id, 'ahead')).toBe(false); expect(build(s, 0, 'rail')).toBe(false); expect(deploy(s, 'guardian')).toBe(false); expect(pulse(s)).toBe(false); expect(repair(s)).toBe(false); expect(JSON.stringify(s)).toBe(snapshot);
	});
});

test('paused and unfocused sorties retain their timers and positions', function () {
	const s = quiet(); deploy(s, 'interceptor'); s.status = 'running'; const w = firstWing(s); scramble(s, w.id, 'port'); advance(s, 3);
	for (const focused of [true, false]) {
		s.focused = focused; s.paused = focused; const snapshot = JSON.stringify(s); advance(s, 30); expect(JSON.stringify(s)).toBe(snapshot);
	}
});
