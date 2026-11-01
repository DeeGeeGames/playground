import { tactical } from '../src/combat-scale';
import { expect, test } from 'bun:test';
import { priorityCoverage } from '../src/play-screen';
import { build, covered, coverageFor, createState, deploy, setPriority, setRally, step, upgrade } from '../src/simulation';
import { mountWorld, worldPoint } from '../src/space';
import { runFlankComparison } from '../scripts/coverage-comparison';
import { runSpendingControl } from '../scripts/combat-pressure';

test('voyage defaults to 120 degrees while scenarios keep 240 and voyage fighters start docked', function () {
	for (const scenario of ['drill', 'systems'] as const) expect(createState({ scenario }).coverageDegrees).toBe(240);
	const state = createState();
	expect(state.coverageDegrees).toBe(120);
	expect(state.experimental).toBe(false);
	deploy(state, 'interceptor'); deploy(state, 'guardian');
	expect(state.wings).toHaveLength(1); expect(state.wings[0]?.phase).toBe('ready'); expect(state.escorts).toHaveLength(1);
	expect(setRally(state, { x: 100, y: 200 })).toBe(true);
	expect(state.rally).toEqual({ x: 100, y: 200 });
});

test('voyage eligibility and priority explanations follow travel, rotation, upgrades and inclusive boundaries', function () {
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
	// A 120° arc leaves fore/aft blind spots, unlike the previous 240° trial.
	for (const x of [-300, 200]) expect(covered(state, mount, worldPoint(state, { x, y: 0 }))).toBe(false);
});

test('out-of-arc priority cannot acquire; an eligible alternative still fires after turning', function () {
	for (const coverageDegrees of [120, 240, 360] as const) {
		const state = createState({ coverageDegrees }); build(state, 0, 'rail'); state.nextWave = Infinity;
		state.systems.allocation = { engines: 0, weapons: 5, shields: 5 };
		state.enemies.push({ id: 99, x: -96, y: 220, hp: 9999, maxHp: 9999, kind: 'armored', cooldown: 99 }, { id: 100, x: -96, y: -220, hp: 9999, maxHp: 9999, kind: 'armored', cooldown: 99 });
		setPriority(state, 99); state.status = 'running';
		const targets: (number | undefined)[] = [];
		for (let tick = 0; tick < 180; tick++) { step(state, 1 / 60); targets.push(...state.shots.filter(function (shot) { return shot.side === 'player'; }).map(function (shot) { return shot.target; })); }
		expect(targets).toContain(coverageDegrees < 360 ? 100 : 99);
		if (coverageDegrees < 360) expect(targets).not.toContain(99);
	}
});

test('equal-cost paired attacks expose wrong-flank pressure and a split fitting covers both', function () {
	for (const flank of [-1, 1] as const) {
		const correct = runFlankComparison(120, flank < 0 ? 'port' : 'starboard', flank);
		const wrong = runFlankComparison(120, flank < 0 ? 'starboard' : 'port', flank);
		const split = runFlankComparison(120, 'split', flank);
		expect(correct.spent).toBe(230); expect(wrong.spent).toBe(correct.spent); expect(split.spent).toBe(correct.spent);
		expect(wrong.minimumShield).toBeLessThan(correct.minimumShield); expect(split.minimumShield).toBe(correct.minimumShield);
		expect(runFlankComparison(360, 'port', flank).minimumShield).toBe(240);
	}
});

test('the same spending policy exposes blind-spot pressure in route defenses', function () {
	const control = runSpendingControl(360); const voyage = runSpendingControl(120);
	expect(control.status).toBe('won'); expect(control.kills).toBeGreaterThan(0);
	expect(control.time).toBeGreaterThan(420); expect(control.time).toBeLessThan(421);
	// Buying weapons alone leaves fore/aft blind spots. This is a pressure signal,
	// not owner acceptance of difficulty or a requirement that every fitting wins.
	expect(voyage.minimumHull).toBeLessThan(control.minimumHull);
	expect(voyage.minimumShield).toBeLessThanOrEqual(control.minimumShield);
	expect(voyage.minimumShield).toBeGreaterThanOrEqual(0);
	expect(voyage.purchases.length).toBeGreaterThan(0);
}, 60000);
