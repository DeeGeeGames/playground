import { expect, test } from 'bun:test';
import { voyageCoverage, priorityCoverage } from '../src/play-screen';
import { build, covered, coverageFor, createState, deploy, setPriority, setRally, step, upgrade } from '../src/simulation';
import { worldPoint } from '../src/space';
import { runFlankComparison } from '../scripts/coverage-comparison';
import { runSpendingControl } from '../scripts/combat-pressure';

test('voyage opt-in is explicit and leaves the control and scenario defaults intact', function () {
	for (const query of ['', '?coverage=360', '?coverage=bad', '?coverage=241']) expect(voyageCoverage(query)).toBe(360);
	expect(voyageCoverage('?coverage=240')).toBe(240);
	for (const scenario of ['drill', 'systems'] as const) expect(createState({ scenario }).coverageDegrees).toBe(240);
	const state = createState({ coverageDegrees: voyageCoverage('?coverage=240') });
	expect(state.experimental).toBe(false);
	deploy(state, 'interceptor'); deploy(state, 'guardian');
	expect(state.wings).toHaveLength(0); expect(state.escorts).toHaveLength(4);
	expect(setRally(state, { x: 100, y: 200 })).toBe(true);
	expect(state.rally).toEqual({ x: 100, y: 200 });
});

test('voyage eligibility and priority explanations follow travel, rotation, upgrades and inclusive boundaries', function () {
	const state = createState({ coverageDegrees: 240 }); state.salvage = 1000; build(state, 0, 'rail');
	const mount = state.mounts[0]; if (!mount) throw new Error('Missing mount');
	state.ark = { x: 900, y: -350, angle: 1.2, speed: 12 };
	const arc = coverageFor(state, mount);
	for (const sign of [-1, 1]) {
		const angle = arc.center + sign * arc.arc / 2;
		expect(covered(state, mount, worldPoint(state, { x: mount.x + Math.cos(angle) * arc.range, y: mount.y + Math.sin(angle) * arc.range }))).toBe(true);
		expect(covered(state, mount, worldPoint(state, { x: mount.x + Math.cos(angle + sign * .001) * 100, y: mount.y + Math.sin(angle + sign * .001) * 100 }))).toBe(false);
	}
	const enemy = { id: 99, ...worldPoint(state, { x: -96, y: 220 }), hp: 260, maxHp: 260, kind: 'armored' as const, cooldown: 99 };
	state.enemies.push(enemy); expect(setPriority(state, enemy.id)).toBe(true);
	expect(priorityCoverage(state, 0)).toContain('outside firing arc');
	Object.assign(enemy, worldPoint(state, { x: mount.x, y: mount.y - 450 }));
	expect(priorityCoverage(state, 0)).toContain('outside range');
	upgrade(state, 0); expect(covered(state, mount, enemy)).toBe(true);
	expect(priorityCoverage(state, 0)).toContain('within range and coverage');
	for (const x of [-300, 200]) expect(covered(state, mount, worldPoint(state, { x, y: 0 }))).toBe(true);
});

test('out-of-arc priority cannot acquire; an eligible alternative still fires after turning', function () {
	for (const coverageDegrees of [240, 360] as const) {
		const state = createState({ coverageDegrees }); build(state, 0, 'rail'); state.nextWave = Infinity;
		state.systems.allocation = { engines: 0, weapons: 5, shields: 5 };
		state.enemies.push({ id: 99, x: -96, y: 220, hp: 9999, maxHp: 9999, kind: 'armored', cooldown: 99 }, { id: 100, x: -96, y: -220, hp: 9999, maxHp: 9999, kind: 'armored', cooldown: 99 });
		setPriority(state, 99); state.status = 'running';
		const targets: (number | undefined)[] = [];
		for (let tick = 0; tick < 180; tick++) { step(state, 1 / 60); targets.push(...state.shots.filter(function (shot) { return shot.side === 'player'; }).map(function (shot) { return shot.target; })); }
		expect(targets).toContain(coverageDegrees === 240 ? 100 : 99);
		if (coverageDegrees === 240) expect(targets).not.toContain(99);
	}
});

test('equal-cost paired attacks expose wrong-flank pressure and a split fitting covers both', function () {
	for (const flank of [-1, 1] as const) {
		const correct = runFlankComparison(240, flank < 0 ? 'port' : 'starboard', flank);
		const wrong = runFlankComparison(240, flank < 0 ? 'starboard' : 'port', flank);
		const split = runFlankComparison(240, 'split', flank);
		expect(correct.spent).toBe(230); expect(wrong.spent).toBe(correct.spent); expect(split.spent).toBe(correct.spent);
		expect(wrong.minimumShield).toBeLessThan(correct.minimumShield); expect(split.minimumShield).toBe(correct.minimumShield);
		expect(runFlankComparison(360, 'port', flank).minimumShield).toBe(240);
	}
});

test('issue 51 spending policy is rerun at both arcs without a budget increase', function () {
	const control = runSpendingControl(); const trial = runSpendingControl(240);
	for (const result of [control, trial]) { expect(result.status).toBe('won'); expect(result.kills).toBe(86); expect(result.minimumHull).toBe(1200); }
	const spent = function (result: typeof control) { return result.purchases.reduce(function (sum, purchase) { return sum + purchase.cost; }, 0); };
	expect(spent(trial)).toBe(spent(control));
});
