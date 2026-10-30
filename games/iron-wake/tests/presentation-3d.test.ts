import { expect, test } from 'bun:test';
import { FrontSide, Mesh, OrthographicCamera, Raycaster, Vector3 } from 'three';
import { advanceGait, createGait } from '../src/gait';
import { createMech } from '../src/mech-3d';
import { cameraFor, screenToWorld, worldToScreen } from '../src/projection';
import { alignCamera } from '../src/projection-3d';
import { createState } from '../src/simulation';

test('orthographic camera matches Canvas positions and ground picking through resize and movement', function () {
	const state = createState(); const view = new OrthographicCamera(-1, 1, 1, -1, 0.1, 6000);
	for (const [width = 1, height = 1] of [[1440, 900], [390, 844], [844, 390]]) {
		for (const at of [{ x: 900, y: 780 }, { x: 70, y: 1100 }]) {
			state.player.x = at.x; state.player.y = at.y; alignCamera(view, width, height, state);
			for (const point of [at, { x: 40, y: 120 }, { x: 1700, y: 1150 }]) for (const elevation of [0, 45, 89]) {
				const projected = new Vector3(point.x, elevation, point.y).project(view);
				const actual = { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 };
				const expected = worldToScreen(point, cameraFor(width, height, state), elevation);
				expect(actual.x).toBeCloseTo(expected.x, 8); expect(actual.y).toBeCloseTo(expected.y, 8);
				const picked = screenToWorld(actual, cameraFor(width, height, state), elevation);
				expect(picked.x).toBeCloseTo(point.x, 8); expect(picked.y).toBeCloseTo(point.y, 8);
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
			const front = ray.intersectObject(model.root).find(function (hit) { return hit.object instanceof Mesh; });
			expect(front?.object.name).toBe('missile-port');
			ray.set(face.clone().addScaledVector(forward, -200), forward);
			const back = ray.intersectObject(model.root).find(function (hit) { return hit.object instanceof Mesh; });
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
