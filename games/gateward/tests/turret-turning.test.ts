import { expect, test } from 'bun:test';
import { build, createState, step, WEAPONS, type Weapon } from '../src/simulation';

const fixture = function (weapon: Weapon) {
	const state = createState(); build(state, 0, weapon);
	state.status = 'running'; state.nextWave = Infinity;
	const mount = state.mounts[0]; if (!mount) throw new Error('Missing mount');
	const enemy = { id: 999, kind: 'armored' as const, x: mount.x + 150, y: mount.y, hp: 10000, maxHp: 10000, cooldown: 999 };
	state.enemies.push(enemy);
	return { state, mount, enemy };
};

for (const weapon of ['flak', 'rail', 'missile', 'beam'] as const) {
	test(`${weapon} turns at its configured speed and cannot fire before alignment`, function () {
		const { state, mount, enemy } = fixture(weapon);
		const initial = mount.aim;
		step(state, 1 / 60);
		expect(mount.aim - initial).toBeCloseTo(WEAPONS[weapon].rotationSpeed / 60);
		expect(state.shots).toHaveLength(0); expect(enemy.hp).toBe(10000);
		for (let i = 0; i < 180 && state.shots.length === 0; i++) step(state, 1 / 60);
		expect(state.shots.some(function (shot) { return shot.weapon === weapon; })).toBe(true);
	});
}

test('turning crosses the angle seam by the short path without overshoot', function () {
	const { state, mount, enemy } = fixture('rail');
	mount.aim = Math.PI - 0.01; enemy.x = mount.x - 150; enemy.y = mount.y - 1.5;
	step(state, 1 / 60);
	expect(mount.aim).toBeCloseTo(Math.PI + Math.atan(0.01));
	expect(state.shots).toHaveLength(1);
});

test('reload does not stop turning; pause, lost focus and zero weapon power freeze it', function () {
	const { state, mount } = fixture('rail'); mount.cooldown = 2;
	step(state, 1 / 60); const aim = mount.aim;
	expect(aim).toBeGreaterThan(-Math.PI / 2); expect(state.shots).toHaveLength(0);
	state.paused = true; step(state, 1 / 60); expect(mount.aim).toBe(aim);
	state.paused = false; state.focused = false; step(state, 1 / 60); expect(mount.aim).toBe(aim);
	state.focused = true; state.systems.allocation = { engines: 5, weapons: 0, shields: 5 };
	step(state, 1 / 60); expect(mount.aim).toBe(aim);
});

test('priority changes require a new turn and interrupt beam damage', function () {
	const { state, mount, enemy } = fixture('beam'); mount.aim = 0;
	step(state, 1 / 60); expect(enemy.hp).toBeLessThan(10000);
	const other = { ...enemy, id: 1000, x: mount.x - 150, hp: 10000 };
	state.enemies.push(other); state.priority = other.id;
	const hp = enemy.hp; step(state, 1 / 60);
	expect(other.hp).toBe(10000); expect(enemy.hp).toBe(hp); expect(state.shots).toHaveLength(0);
	expect(Math.abs(mount.aim)).toBeCloseTo(WEAPONS.beam.rotationSpeed / 60);
});

test('ballistic barrels align with the moving-target lead before launching', function () {
	const { state, mount } = fixture('rail');
	const enemy = state.enemies[0]; if (!enemy) throw new Error('Missing enemy');
	enemy.flight = { angle: -Math.PI / 2, speed: 40, side: 1, course: 'intercept', run: 1 };
	for (let i = 0; i < 180; i++) {
		step(state, 1 / 60);
		const shot = state.shots.find(function (entry) { return entry.weapon === 'rail'; });
		if (!shot) continue;
		expect(Math.atan2(shot.vy, shot.vx)).toBeCloseTo(mount.aim);
		return;
	}
	throw new Error('Railgun never aligned');
});
