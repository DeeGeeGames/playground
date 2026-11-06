import { AdditiveBlending, BoxGeometry, ConeGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Shape, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HULLS, type HullKind } from './formation';

// All decks end below the existing gameplay hardpoint plane. Hulls face the
// direction of travel; turret facing remains the formation's outward arc.
export const createConvoyCraft = function (kind: HullKind) {
	const root = new Group(); root.name = `Convoy_${kind}`;
	const scale = HULLS[kind].scale;
	const armor = new MeshStandardMaterial({ color: '#b4bbb3', roughness: 0.72, metalness: 0.32 });
	const structure = new MeshStandardMaterial({ color: '#30434e', roughness: 0.7, metalness: 0.5 });
	const stripe = new MeshStandardMaterial({ color: '#3a8e91', roughness: 0.55, metalness: 0.3, emissive: '#153539', emissiveIntensity: 0.3 });
	const windows = new MeshBasicMaterial({ color: '#a3e3d8' });
	const drive = new MeshBasicMaterial({ color: '#8cddd8' });
	const plates: BufferGeometry[] = []; const ribs: BufferGeometry[] = []; const markings: BufferGeometry[] = []; const lamps: BufferGeometry[] = []; const engines: BufferGeometry[] = [];
	const box = function (parts: BufferGeometry[], x: number, y: number, z: number, width: number, height: number, depth: number) {
		const geometry = new BoxGeometry(width * scale, height, depth * scale);
		geometry.translate(x * scale, y, z * scale); parts.push(geometry);
	};
	const hull = function (parts: BufferGeometry[], outline: readonly (readonly [number, number])[], y: number, depth: number) {
		const first = outline[0]; if (!first) return;
		const shape = new Shape(); shape.moveTo(first[0] * scale, -first[1] * scale);
		for (const [x, z] of outline.slice(1)) shape.lineTo(x * scale, -z * scale);
		shape.closePath();
		const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 1, bevelSize: 1.1, bevelThickness: 1, steps: 1, curveSegments: 1 });
		geometry.rotateX(-Math.PI / 2); geometry.translate(0, y, 0); parts.push(geometry);
	};
	hull(ribs, [[-62, -25], [25, -29], [68, -10], [73, 0], [68, 10], [25, 29], [-62, 25]], -12, 16);
	hull(plates, [[-53, -25], [28, -25], [62, -9], [67, 0], [62, 9], [28, 25], [-53, 25]], 3, 7);
	for (const side of [-1, 1]) {
		// Outriggers give the three classes a family resemblance while keeping
		// the center deck clear for one, two or four independently picked guns.
		const across = kind === 'cruiser' ? 33 : 29;
		box(ribs, -12, -2, side * across, 91, 12, 12);
		box(plates, -8, 5, side * across, 79, 7, 9);
		box(markings, 11, 9, side * across, 26, 1.2, 9.5);
		box(lamps, 43, 8, side * 20, 3, 2, 5);
		for (const x of [-40, -27, -14]) box(ribs, x, 9, side * across, 4, 1.8, 8);
		const nozzle = new CylinderGeometry(8 * scale, 9 * scale, 12 * scale, 12);
		nozzle.rotateZ(Math.PI / 2); nozzle.translate(-65 * scale, -1, side * across * scale); ribs.push(nozzle);
		const core = new CylinderGeometry(5.8 * scale, 5.8 * scale, scale, 12);
		core.rotateZ(Math.PI / 2); core.translate(-71.5 * scale, -1, side * across * scale); engines.push(core);
	}
	box(plates, -45, 14, 0, 17, 8, 20);
	box(lamps, -35.8, 14, 0, 1.2, 3, 17);
	box(ribs, -47, 21, 0, 4, 7, 3);
	box(markings, 47, 11, 0, 14, 1, 10);
	if (kind === 'cruiser') {
		box(ribs, -20, -9, 0, 68, 10, 44);
		for (const side of [-1, 1]) box(plates, -36, 7, side * 39, 38, 9, 7);
	}
	for (const [parts, material] of [[plates, armor], [ribs, structure], [markings, stripe], [lamps, windows], [engines, drive]] as const) {
		const nonIndexed = parts.map(function (part) { return part.index ? part.toNonIndexed() : part; });
		const geometry = mergeGeometries(nonIndexed, false);
		for (const part of new Set([...parts, ...nonIndexed])) part.dispose();
		if (!geometry) throw new Error(`Unable to assemble ${kind} geometry`);
		const mesh = new Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
	}
	const thrust = new MeshBasicMaterial({ color: '#80d9d7', transparent: true, opacity: 0.25, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
	const plumes = [-1, 1].map(function (side) {
		const plume = new Mesh(new ConeGeometry(6 * scale, 1, 10, 1, true), thrust);
		plume.rotation.z = Math.PI / 2; plume.position.set(-83 * scale, -1, side * (kind === 'cruiser' ? 33 : 29) * scale); root.add(plume); return plume;
	});
	return {
		root,
		update: function (hp: number, selected: boolean, running: boolean, time: number, reducedMotion: boolean) {
			root.visible = hp > 0;
			armor.color.set(hp < HULLS[kind].hp * 0.35 ? '#817c70' : '#b4bbb3');
			stripe.color.set(selected ? '#d5bb77' : '#3a8e91');
			stripe.emissive.set(selected ? '#806b35' : '#153539');
			for (const plume of plumes) {
				const length = running ? (28 + (reducedMotion ? 0 : Math.sin(time * 13) * 2)) * scale : 6 * scale;
				plume.scale.y = length; plume.position.x = -72 * scale - length / 2;
			}
		},
	};
};
