import { expect, test } from 'bun:test';
import { Raycaster, Vector3 } from 'three';
import { CRAFT_MOUNTS, craftTurretSolution, type TurretCraft } from '../src/craft-turrets';
import { createEnemy, createEscort, disposeObject } from '../src/actors-3d';
import { createState, deploy, step } from '../src/simulation';

for (const kind of ['guardian', 'bomber', 'armored', 'flagship'] as const) {
	test(`${kind} legal turret rays clear their own hull and start at visible barrel tips`, function () {
		const model = kind === 'guardian' ? createEscort({ id: 1, kind, x: 0, y: 0, hp: 100, cooldown: 0, angle: 0 }) : createEnemy({ id: 1, kind, x: 0, y: 0, hp: 100, maxHp: 100, cooldown: 0 });
		try {
			for (let degrees = -180; degrees < 180; degrees += 5) {
				const angle = degrees * Math.PI / 180;
				const target = { x: Math.cos(angle) * 200, y: Math.sin(angle) * 200 };
				const aim = craftTurretSolution(kind, { x: 0, y: 0 }, 0, function () { return target; });
				if (!aim) continue;
				const turret = model.getObjectByName(`CraftTurret_${aim.mount}`);
				if (!turret) throw new Error('Missing visible turret');
				turret.rotation.y = -aim.angle; model.updateMatrixWorld(true);
				const mount = CRAFT_MOUNTS[kind][aim.mount];
				if (!mount) throw new Error('Missing mount');
				const tip = turret.localToWorld(new Vector3(mount.barrel, 0, 0));
				expect(tip.x).toBeCloseTo(aim.muzzle.x); expect(tip.z).toBeCloseTo(aim.muzzle.y); expect(tip.y).toBe(aim.height);
				const direction = new Vector3(target.x - tip.x, 0, target.y - tip.z).normalize();
				const ray = new Raycaster(tip.clone().addScaledVector(direction, 0.01), direction, 0, 300);
				expect(ray.intersectObject(model, true)).toHaveLength(0);
			}
		} finally { disposeObject(model); }
	});
}

test('side turret arcs reject bow/stern and remain correct after hull rotation', function () {
	for (const kind of ['armored', 'flagship'] satisfies TurretCraft[]) {
		for (const heading of [0, 1.2, -2.4]) {
			const craft = { x: 42, y: -83 };
			for (const bearing of [0, Math.PI]) expect(craftTurretSolution(kind, craft, heading, function () { return { x: craft.x + Math.cos(heading + bearing) * 300, y: craft.y + Math.sin(heading + bearing) * 300 }; })).toBeUndefined();
			for (const side of [-1, 1]) expect(craftTurretSolution(kind, craft, heading, function () { return { x: craft.x - Math.sin(heading) * side * 300, y: craft.y + Math.cos(heading) * side * 300 }; })).toBeDefined();
		}
	}
});

test('guardian perimeter turrets cover every distant bearing and land repeated hits', function () {
	for (let angle = 0; angle < Math.PI * 2; angle += 0.1) expect(craftTurretSolution('guardian', { x: 0, y: 0 }, 0, function () { return { x: Math.cos(angle) * 200, y: Math.sin(angle) * 200 }; })).toBeDefined();
	const state = createState(); state.status = 'running'; state.nextWave = Infinity;
	deploy(state, 'guardian'); state.rally = { x: 0, y: -180 };
	const enemy = { id: state.nextId++, kind: 'armored' as const, x: 80, y: -180, hp: 100000, maxHp: 100000, cooldown: 999 };
	state.enemies.push(enemy);
	let shots = 0;
	for (let frame = 0; frame < 1200; frame++) {
		const id = state.nextId; step(state, 1 / 60);
		shots += state.shots.filter(function (shot) { return shot.id >= id && shot.weapon === 'escort' && shot.originHeight !== undefined; }).length;
	}
	expect(shots).toBeGreaterThan(3); expect(enemy.hp).toBeLessThan(100000);
});
