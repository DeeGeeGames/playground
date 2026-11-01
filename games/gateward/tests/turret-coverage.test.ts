import { tactical } from '../src/combat-scale';
import { expect, test } from 'bun:test';
import { priorityCoverage } from '../src/play-screen';
import { build, covered, coverageFor, createState, deploy, setPriority, step, upgrade } from '../src/simulation';
import { mountWorld, worldPoint } from '../src/space';

test('the single game uses 120-degree arcs and fighters start docked', function () {
	const state = createState();
	expect(state.coverageDegrees).toBe(120);
	deploy(state, 'interceptor'); deploy(state, 'guardian');
	expect(state.wings).toHaveLength(1); expect(state.wings[0]?.phase).toBe('ready'); expect(state.escorts).toHaveLength(1);
});

test('turret eligibility and priority explanations follow travel, rotation, upgrades and inclusive boundaries', function () {
	const state = createState(); state.salvage = 1000; build(state, 0, 'rail');
	const mount = state.mounts[0]; if (!mount) throw new Error('Missing mount');
	state.ark = { x: 900, y: -350, angle: 1.2, speed: 12 };
	const arc = coverageFor(state, mount);
	for (const sign of [-1, 1]) {
		const angle = arc.center + sign * arc.arc / 2;
		expect(covered(state, mount, worldPoint(state, { z: mountWorld(state, mount).z ?? 0, x: mount.x + Math.cos(angle) * arc.range, y: mount.y + Math.sin(angle) * arc.range }))).toBe(true);
		expect(covered(state, mount, worldPoint(state, { x: mount.x + Math.cos(angle + sign * .001) * 100, y: mount.y + Math.sin(angle + sign * .001) * 100 }))).toBe(false);
	}
	const enemy = { id: 99, ...worldPoint(state, { x: -96, y: 220 }), hp: 260, maxHp: 260, kind: 'armored' as const, cooldown: 99 };
	state.enemies.push(enemy); expect(setPriority(state, enemy.id)).toBe(true);
	expect(priorityCoverage(state, 0)).toContain('outside firing arc');
	Object.assign(enemy, worldPoint(state, { x: mount.x, y: mount.y - tactical(450) }));
	expect(priorityCoverage(state, 0)).toContain('outside range');
	upgrade(state, 0); expect(covered(state, mount, enemy)).toBe(true);
	expect(priorityCoverage(state, 0)).toContain('within range and coverage');
	// A 120° arc leaves fore/aft blind spots.
	for (const x of [-300, 200]) expect(covered(state, mount, worldPoint(state, { x, y: 0 }))).toBe(false);
});

test('out-of-arc priority cannot acquire; an eligible alternative still fires after turning', function () {
	const state = createState(); build(state, 0, 'rail'); state.nextWave = Infinity;
	state.systems.allocation = { engines: 0, weapons: 5, shields: 5 };
	state.enemies.push({ id: 99, x: -96, y: 220, hp: 9999, maxHp: 9999, kind: 'armored', cooldown: 99 }, { id: 100, x: -96, y: -220, hp: 9999, maxHp: 9999, kind: 'armored', cooldown: 99 });
	setPriority(state, 99); state.status = 'running';
	const targets: (number | undefined)[] = [];
	for (let tick = 0; tick < 180; tick++) { step(state, 1 / 60); targets.push(...state.shots.filter(function (shot) { return shot.side === 'player'; }).map(function (shot) { return shot.target; })); }
	expect(targets).toContain(100); expect(targets).not.toContain(99);
});
