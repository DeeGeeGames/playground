import { expect, test } from 'bun:test';
import { FrontSide, InstancedMesh, Matrix4, Mesh, OrthographicCamera, Raycaster, Vector3 } from 'three';
import { advanceGait, createGait, mechScale } from '../src/gait';
import { createMech } from '../src/mech-3d';
import { alignCamera, toGround, viewScale } from '../src/projection-3d';
import { createState } from '../src/simulation';
import type { EnemyKind } from '../src/simulation';

test('orthographic camera matches Canvas positions and ground picking through resize and movement', function () {
	const state = createState(); const view = new OrthographicCamera(-1, 1, 1, -1, 0.1, 6000);
	for (const [width = 1, height = 1] of [[1440, 900], [390, 844], [844, 390]]) {
		for (const at of [{ x: 900, y: 780 }, { x: 70, y: 1100 }]) {
			state.player.x = at.x; state.player.y = at.y; alignCamera(view, width, height, state);
			for (const point of [at, { x: 40, y: 120 }, { x: 1700, y: 1150 }]) for (const elevation of [0, 45, 89]) {
				const projected = new Vector3(point.x, elevation, point.y).project(view);
				const actual = { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 };
				// Recorded Canvas framing, retained as a migration reference only.
				const scale = viewScale(width, height);
				const expected = { x: ((point.x - point.y) - (at.x - at.y)) * Math.sqrt(3) / 2 * scale + width / 2,
					y: ((point.x + point.y - at.x - at.y) * 0.5 - elevation) * scale + height * 0.52 };
				expect(actual.x).toBeCloseTo(expected.x, 8); expect(actual.y).toBeCloseTo(expected.y, 8);
				if (elevation === 0) {
					const picked = toGround(actual, view, width, height); if (!picked) throw new Error('Missing ground intersection');
					expect(picked.x).toBeCloseTo(point.x, 8); expect(picked.y).toBeCloseTo(point.y, 8);
				}
			}
		}
	}
});

test('missile ports have front-facing surfaces and racks occlude them from behind throughout a rotation', function () {
	const model = createMech(); const gait = createGait({ x: 0, y: 0, angle: 0 });
	const ray = new Raycaster();
	try {
		for (let i = 0; i < 24; i++) {
			const heading = i * Math.PI / 12; model.pose(gait, heading); model.root.updateMatrixWorld(true);
			const forward = new Vector3(Math.cos(heading), 0, Math.sin(heading));
			const face = new Vector3(0.035, 77, 33).applyAxisAngle(new Vector3(0, 1, 0), -heading);
			ray.set(face.clone().addScaledVector(forward, 200), forward.clone().negate());
			const front = ray.intersectObject(model.root).find(function (hit) { return hit.object instanceof Mesh && hit.object.visible; });
			expect(front?.object.name).toBe('missile-port');
			ray.set(face.clone().addScaledVector(forward, -200), forward);
			const back = ray.intersectObject(model.root).find(function (hit) { return hit.object instanceof Mesh && hit.object.visible; });
			expect(back).toBeDefined(); expect(back?.object.name).not.toBe('missile-port');
		}
		model.root.traverse(function (object) {
			if (!(object instanceof Mesh)) return;
			for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
				expect(material.depthTest).toBe(true); expect(material.depthWrite).toBe(true); expect(material.side).toBe(FrontSide);
			}
		});
	} finally { model.dispose(); }
});

test('mesh feet retain world planting when the hull translates and turns independently of the turret', function () {
	const body = { x: 900, y: 780, angle: 0 }; const initial = createGait(body);
	const gait = advanceGait(initial, { x: 902, y: 780, angle: 0.04 }, 1 / 60);
	const model = createMech();
	try {
		model.pose(gait, Math.PI); model.root.position.set(gait.body.x, 0, gait.body.y); model.root.updateMatrixWorld(true);
		const feet = model.root.children.filter(function (child) { return child.children.length === 3; });
		expect(feet).toHaveLength(2);
		for (const [index, foot] of feet.entries()) {
			const expected = initial.feet[index === 0 ? 0 : 1]; const actual = foot.getWorldPosition(new Vector3());
			expect(actual.x).toBeCloseTo(expected.x, 8); expect(actual.z).toBeCloseTo(expected.y, 8); expect(actual.y).toBe(0);
		}
		expect(model.root.getObjectByName('hull')?.rotation.y).toBeCloseTo(-gait.body.angle);
		expect(model.root.getObjectByName('turret')?.rotation.y).toBeCloseTo(-Math.PI);
	} finally { model.dispose(); }
});

test('cockpit visor has physical depth separation from the shell through a full rotation', function () {
	const model = createMech(); const gait = createGait({ x: 0, y: 0, angle: 0 }); const ray = new Raycaster();
	try {
		for (let i = 0; i < 24; i++) {
			const heading = i * Math.PI / 12; model.pose(gait, heading); model.root.updateMatrixWorld(true);
			const forward = new Vector3(Math.cos(heading), 0, Math.sin(heading));
			const origin = new Vector3(200, 66, 0).applyAxisAngle(new Vector3(0, 1, 0), -heading);
			ray.set(origin, forward.negate());
			const hits = ray.intersectObject(model.root);
			const visor = hits.find(function (hit) { return hit.object.name === 'cockpit-visor' && hit.object.visible; });
			const shell = hits.find(function (hit) { return hit.object.name === 'armor' && hit.object.visible; });
			if (!visor || !shell) throw new Error('Missing cockpit surface');
			// Instance transforms are uploaded as float32 matrices.
			expect(shell.distance - visor.distance).toBeCloseTo(0.25, 4);
		}
	} finally { model.dispose(); }
});

test('render batches follow planted pose handles when ECS synchronizes the root after posing', function () {
	const kinds: readonly (EnemyKind | undefined)[] = [undefined, 'scout', 'striker', 'siege'];
	for (const kind of kinds) {
		const size = kind ? mechScale(kind) : 1; const model = createMech(kind);
		model.root.matrixAutoUpdate = false; model.root.matrixWorldAutoUpdate = false;
		let gait = createGait({ x: 900, y: 780, angle: 0 }, size);
		try {
			for (let tick = 0; tick < 120; tick++) {
				gait = advanceGait(gait, { x: 900 + Math.min(tick, 120 - tick), y: 780, angle: tick / 60 }, 1 / 60, size);
				model.pose(gait, -tick / 60);
				// renderer3D applies the entity transform after the view's pose.
				model.root.matrixWorld.makeTranslation(gait.body.x, 0, gait.body.y); model.root.updateMatrixWorld(true);
				const handles: Mesh[] = []; model.root.traverse(function (object) { if (object instanceof Mesh && !object.visible) handles.push(object); });
				for (const batch of model.root.children) {
					if (!(batch instanceof InstancedMesh)) continue;
					const members = handles.filter(function (handle) { return handle.material === batch.material; });
					for (const [index, member] of members.entries()) {
						const matrix = new Matrix4(); batch.getMatrixAt(index, matrix); matrix.premultiply(batch.matrixWorld);
						const actual = new Vector3().setFromMatrixPosition(matrix); const expected = member.getWorldPosition(new Vector3());
						expect(actual.distanceTo(expected)).toBeLessThan(0.00001);
					}
				}
			}
		} finally { model.dispose(); }
	}
});
