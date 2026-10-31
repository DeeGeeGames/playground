import { expect, test } from 'bun:test';
import { build, createState, mountTarget, step, type Enemy, type EnemyKind, type Weapon } from '../src/simulation';

const contact = function (id: number, kind: EnemyKind, x: number, y: number): Enemy {
	return { id, kind, x, y, hp: 10000, maxHp: 10000, cooldown: 999 };
};
const fixture = function (weapon: Weapon, coverageDegrees = 120) {
	const state = createState({ coverageDegrees });
	build(state, 0, weapon); state.status = 'running'; state.nextWave = Infinity;
	const mount = state.mounts[0]; if (!mount) throw new Error('Missing mount');
	state.enemies = [contact(100, 'bomber', -96, -120), contact(101, 'raider', -160, -230), contact(102, 'armored', -30, -250), contact(103, 'flagship', -25, -290)];
	return { state, mount };
};
for (const arc of [120, 240, 360]) {
	for (const [weapon, expected] of [['flak', 101], ['rail', 102], ['missile', 102], ['beam', 100]] as const) {
		test(`${weapon} chooses its role at ${arc} degrees despite a nearer bomber`, function () {
			const { state, mount } = fixture(weapon, arc);
			expect(mountTarget(state, mount)?.id).toBe(expected);
		});
	}
}
for (const weapon of ['flak', 'rail', 'missile', 'beam'] as const) {
	test(`${weapon} priority overrides preferences only while eligible`, function () {
		const { state, mount } = fixture(weapon);
		const priority = state.enemies[0]; if (!priority) throw new Error('Missing contact');
		state.priority = priority.id;
		expect(mountTarget(state, mount)?.id).toBe(priority.id);
		for (const invalid of [{ hp: 0 }, { y: -900 }, { y: 120 }, { x: 500, y: -100 }]) {
			const original = { ...priority }; Object.assign(priority, invalid);
			expect(mountTarget(state, mount)?.id).not.toBe(priority.id);
			expect(mountTarget(state, mount)).toBeDefined(); Object.assign(priority, original);
		}
		state.systems.sensors.integrity = 0; priority.y = -300;
		expect(mountTarget(state, mount)?.id).not.toBe(priority.id);
	});
	test(`${weapon} resolves equal scores by distance then ID independent of array order`, function () {
		const { state, mount } = fixture(weapon);
		state.enemies = [contact(20, 'bomber', -96, -180), contact(10, 'bomber', -96, -180)];
		expect(mountTarget(state, mount)?.id).toBe(10);
		state.enemies.reverse(); expect(mountTarget(state, mount)?.id).toBe(10);
		state.enemies = []; expect(mountTarget(state, mount)).toBeUndefined();
	});
}
for (const weapon of ['flak', 'rail'] as const) {
	test(`${weapon} cannot use unclassified kinds and falls back without preferred targets`, function () {
		const { state, mount } = fixture(weapon);
		state.systems.sensors.integrity = 0;
		state.enemies = [contact(100, 'bomber', -96, -90), contact(101, weapon === 'flak' ? 'raider' : 'armored', -96, -170)];
		expect(mountTarget(state, mount)?.id).toBe(100);
		state.systems.sensors.integrity = 100; expect(mountTarget(state, mount)?.id).toBe(101);
		state.enemies = [contact(100, 'bomber', -96, -90), contact(101, 'bomber', -96, -170)];
		expect(mountTarget(state, mount)?.id).toBe(100);
	});
}

test('missile clusters use detected live neighbours and the strict splash radius', function () {
	const { state, mount } = fixture('missile', 360); state.systems.sensors.integrity = 25;
	state.enemies = [contact(100, 'bomber', -96, -100), contact(101, 'bomber', 240, -120), contact(102, 'raider', 300, -120)];
	expect(mountTarget(state, mount)?.id).toBe(101);
	const neighbour = state.enemies[2]; if (!neighbour) throw new Error('Missing neighbour');
	neighbour.x = 325; expect(mountTarget(state, mount)?.id).toBe(100); // exactly 85m
	neighbour.x = 315; neighbour.y = -140; // outside impaired detection
	expect(mountTarget(state, mount)?.id).toBe(100);
	neighbour.x = 300; neighbour.y = -120; neighbour.hp = 0;
	expect(mountTarget(state, mount)?.id).toBe(100);
});

test('upgraded range admits preferred targets without ignoring mount coverage', function () {
	const { state, mount } = fixture('flak');
	state.enemies = [contact(100, 'bomber', -96, -100), contact(101, 'raider', -96, -320)];
	expect(mountTarget(state, mount)?.id).toBe(100);
	mount.level = 2; expect(mountTarget(state, mount)?.id).toBe(101);
});

for (const weapon of ['flak', 'rail', 'missile', 'beam'] as const) {
	test(`${weapon} moving mixed threats produce repeatable trajectories and allow alignment`, function () {
		const run = function () {
			const { state, mount } = fixture(weapon, 240); mount.aim = 0;
			const trajectories = [];
			for (let tick = 0; tick < 240; tick++) {
				step(state, 1 / 60);
				trajectories.push(state.shots.map(function (shot) { return { ...shot }; }));
			}
			expect(trajectories.some(function (shots) { return shots.some(function (shot) { return shot.weapon === weapon; }); })).toBe(true);
			return trajectories;
		};
		expect(run()).toEqual(run());
	});
}

for (const weapon of ['flak', 'rail'] as const) {
	test(`${weapon} ignores class outside impaired classification range`, function () {
		const { state, mount } = fixture(weapon, 360); state.systems.sensors.integrity = 25;
		state.enemies = [contact(100, 'bomber', -96, -120), contact(101, weapon === 'flak' ? 'raider' : 'flagship', -96, -260)];
		expect(mountTarget(state, mount)?.id).toBe(100);
		state.systems.sensors.integrity = 100;
		expect(mountTarget(state, mount)?.id).toBe(101);
	});
}
