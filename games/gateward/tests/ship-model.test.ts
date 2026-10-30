import { expect, test } from 'bun:test';
import { Box3, Mesh, MeshStandardMaterial, Raycaster, Vector2, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createState } from '../src/simulation';
import { DECK_HEIGHT, toScreen, viewFor } from '../src/projection';
import { SHIELD_CENTER, SHIELD_RADII } from '../src/ship-config';
import { disposeObject } from '../src/actors-3d';

const loadModel = async function () {
	const file = Bun.file(new URL('../public/models/gateward-ark.glb', import.meta.url));
	return (await new GLTFLoader().parseAsync(await file.arrayBuffer(), '')).scene;
};

test('the shipped Blender model retains exact gameplay hardpoints and a solid faceted body', async function () {
	const model = await loadModel();
	try {
		model.updateMatrixWorld(true);
		for (const [index, mount] of createState().mounts.entries()) {
			const anchor = model.getObjectByName(`Mount_${String(index + 1).padStart(2, '0')}`);
			expect(anchor).toBeDefined();
			if (!anchor) throw new Error('Missing hardpoint');
			const point = anchor.getWorldPosition(new Vector3());
			expect(point.distanceTo(new Vector3(mount.x, DECK_HEIGHT, mount.y))).toBeLessThan(0.001);
			expect(anchor.children.some(function (child) { return child.name.startsWith('Pad_'); })).toBe(true);
		}
		const size = new Box3().setFromObject(model).getSize(new Vector3());
		expect(size.x).toBeGreaterThan(550);
		expect(size.x).toBeLessThan(650);
		expect(size.z).toBeGreaterThan(140);
		expect(size.z).toBeLessThan(185);
		expect(size.y).toBeGreaterThan(150);
		expect(model.getObjectByName('Cube')).toBeUndefined();
		for (let index = 1; index <= 4; index++) {
			const drive = model.getObjectByName(`Drive_${String(index).padStart(2, '0')}`);
			expect(drive).toBeInstanceOf(Mesh);
			if (!(drive instanceof Mesh)) throw new Error('Missing stern drive');
			expect(drive.material).toBeInstanceOf(MeshStandardMaterial);
		}
	} finally { disposeObject(model); }
});

test('the Aegis display envelope contains every shipped hull and bridge vertex', async function () {
	const model = await loadModel();
	try {
		model.updateMatrixWorld(true);
		let extent = 0;
		const point = new Vector3();
		model.traverse(function (object) {
			if (!(object instanceof Mesh)) return;
			const positions = object.geometry.getAttribute('position');
			for (let index = 0; index < positions.count; index++) {
				point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
				const normalized = ((point.x - SHIELD_CENTER.x) / SHIELD_RADII.x) ** 2 + ((point.y - SHIELD_CENTER.y) / SHIELD_RADII.y) ** 2 + ((point.z - SHIELD_CENTER.z) / SHIELD_RADII.z) ** 2;
				extent = Math.max(extent, normalized);
			}
		});
		expect(extent).toBeGreaterThan(0.5);
		expect(extent).toBeLessThan(1);
	} finally { disposeObject(model); }
});

test('every ship pad is unobstructed in the default tactical camera', async function () {
	const model = await loadModel();
	try {
		model.updateMatrixWorld(true);
		const view = viewFor(1152, 844);
		const raycaster = new Raycaster();
		for (const [index, mount] of createState().mounts.entries()) {
			const at = toScreen(mount, view, DECK_HEIGHT);
			raycaster.setFromCamera(new Vector2(at.x / view.width * 2 - 1, 1 - at.y / view.height * 2), view.camera);
			const first = raycaster.intersectObject(model, true)[0];
			expect(first?.object.name).toBe(`Pad_${String(index + 1).padStart(2, '0')}`);
		}
	} finally { disposeObject(model); }
});
