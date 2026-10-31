import { BoxGeometry, SphereGeometry, BufferGeometry, CylinderGeometry, ExtrudeGeometry, Group, Line, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Points, Shape, TorusGeometry } from 'three';
import { DECK_HEIGHT, TURRET_HEIGHT } from './projection';
import { TURRET_RISE, TURRET_SCALE } from './ship-config';
import type { Mount, Weapon } from './simulation';

export { createEnemy, createEscort } from './craft-3d';

type Outline = readonly (readonly [number, number])[];
type SolidMaterial = MeshStandardMaterial | MeshBasicMaterial;

export interface TurretVisual {
	readonly root: Group;
	readonly update: (mount: Mount, selected: boolean, firing?: { strength: number; beam: boolean }, reducedMotion?: boolean) => void;
}

const armor = function (color: string, emissive = '#000000'): MeshStandardMaterial {
	return new MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.32, metalness: 0.38, roughness: 0.66 });
};

const light = function (color: string): MeshBasicMaterial { return new MeshBasicMaterial({ color }); };

const addBox = function (parent: Group, geometry: BoxGeometry, material: SolidMaterial, x: number, y: number, z: number, width: number, height: number, depth: number): Mesh {
	const mesh = new Mesh(geometry, material);
	mesh.position.set(x, y, z);
	mesh.scale.set(width, height, depth);
	parent.add(mesh);
	return mesh;
};

const hullGeometry = function (outline: Outline, height: number): ExtrudeGeometry {
	const first = outline[0];
	if (!first) throw new Error('A ship hull needs an outline');
	const shape = new Shape();
	shape.moveTo(first[0], -first[1]);
	for (const [x, z] of outline.slice(1)) shape.lineTo(x, -z);
	shape.closePath();
	const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelThickness: 0.65, bevelSize: 0.65, bevelSegments: 1, curveSegments: 1, steps: 1 });
	geometry.rotateX(-Math.PI / 2);
	geometry.translate(0, -height / 2, 0);
	return geometry;
};

const addHull = function (parent: Group, outline: Outline, height: number, material: MeshStandardMaterial, y = 0): Mesh {
	const mesh = new Mesh(hullGeometry(outline, height), material);
	mesh.position.y = y;
	parent.add(mesh);
	return mesh;
};

export const createTurret = function (mount: Mount): TurretVisual {
	const root = new Group();
	root.name = `Hardpoint_${mount.x}_${mount.y}`;
	const box = new BoxGeometry(1, 1, 1);
	const dark = armor('#263742');
	const steel = armor('#647683');
	const edge = armor('#9babb2');
	const podArmor = armor('#7d8079');
	const emptyInk = light('#799eac');
	const accents: Record<Weapon, MeshBasicMaterial> = { beam: light('#ff86c8'), flak: light('#91e3da'), rail: light('#cdb6ef'), missile: light('#edc589') };
	const indicator = light('#91e3da');

	const pad = new Mesh(new CylinderGeometry(18, 19, 3, 12), dark);
	pad.position.y = -0.5;
	root.add(pad);
	const ring = new Mesh(new TorusGeometry(17.5, 0.8, 6, 32), indicator);
	ring.rotation.x = Math.PI / 2;
	root.add(ring);
	const empty = new Group();
	empty.name = 'EmptyPad';
	addBox(empty, box, emptyInk, 0, 1.4, 0, 9, 0.7, 1.3);
	addBox(empty, box, emptyInk, 0, 1.4, 0, 1.3, 0.7, 9);
	root.add(empty);

	const assembly = new Group();
	assembly.scale.setScalar(TURRET_SCALE);
	root.add(assembly);
	const barbette = new Mesh(new CylinderGeometry(15, 17, TURRET_RISE, 16), steel);
	barbette.position.y = TURRET_RISE / 2;
	assembly.add(barbette);
	const pivot = new Group();
	pivot.name = 'TurretAim';
	pivot.position.y = TURRET_RISE;
	assembly.add(pivot);
	addHull(pivot, [[-13, -10], [7, -10], [13, -5], [13, 5], [7, 10], [-13, 10]], 8, steel, 5);
	addBox(pivot, box, edge, -5, 9.5, 0, 10, 1.2, 12);

	const flak = new Group();
	flak.name = 'Flak';
	for (const z of [-5, 5]) {
		addBox(flak, box, dark, 21, 6, z, 26, 4, 4);
		addBox(flak, box, edge, 15, 6.5, z, 10, 4.5, 4.5);
		addBox(flak, box, accents.flak, 34, 6, z, 2, 3.5, 3.5);
	}
	pivot.add(flak);

	const rail = new Group();
	rail.name = 'Railgun';
	addBox(rail, box, dark, 26, 6, 0, 38, 4, 5);
	addBox(rail, box, edge, 26, 8.4, 0, 35, 1.2, 3);
	for (const x of [15, 23, 31]) addBox(rail, box, accents.rail, x, 9.1, 0, 3, 1, 5.5);
	addBox(rail, box, accents.rail, 45.5, 6, 0, 1.5, 3.5, 4.5);
	pivot.add(rail);

	const beam = new Group();
	beam.name = 'Beam';
	addBox(beam, box, dark, 22, 6, 0, 24, 8, 10);
	addBox(beam, box, accents.beam, 35, 6, 0, 3, 7, 9);
	pivot.add(beam);

	const missile = new Group();
	missile.name = 'Missiles';
	const apertureGeometry = new CylinderGeometry(1.2, 1.2, 0.65, 8);
	for (const z of [-8, 8]) {
		addBox(missile, box, podArmor, 0, 9, z, 27, 10, 8);
		addBox(missile, box, dark, 13.7, 9, z, 0.8, 8, 6);
		addBox(missile, box, edge, -1, 14.3, z, 23, 0.8, 5);
		for (const across of [-2, 2]) {
			for (const elevation of [-2, 2]) {
				const aperture = new Mesh(apertureGeometry, accents.missile);
				aperture.rotation.z = -Math.PI / 2;
				aperture.position.set(14.3, 9 + elevation, z + across);
				missile.add(aperture);
			}
		}
	}
	pivot.add(missile);

	const flash = new Mesh(new SphereGeometry(1, 8, 6), new MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }));
	const secondFlash = new Mesh(flash.geometry, flash.material); pivot.add(secondFlash);
	flash.name = 'MuzzleFlash'; flash.visible = false; pivot.add(flash);
	const variants: Record<Weapon, Group> = { flak, rail, missile, beam };
	const pips = Array.from({ length: 3 }, function (_, index) {
		return addBox(assembly, box, indicator, (index - 1) * 5, TURRET_RISE + 1.2, 16.2, 3, 1.5, 2.5);
	});
	const update = function (next: Mount, selected: boolean, firing?: { strength: number; beam: boolean }, reducedMotion = false) {
		root.position.set(next.x, DECK_HEIGHT, next.y);
		const fitted = next.weapon !== undefined;
		empty.visible = !fitted;
		barbette.visible = fitted;
		pivot.visible = fitted;
		pivot.rotation.y = -next.aim;
		ring.position.y = fitted ? TURRET_HEIGHT - DECK_HEIGHT + 0.5 * TURRET_SCALE : 1.6;
		ring.scale.setScalar(fitted ? TURRET_SCALE : 1);
		indicator.color.set(selected ? '#d6efad' : next.weapon === 'rail' ? '#cdb6ef' : next.weapon === 'missile' ? '#edc589' : '#91e3da');
		const strength = firing?.strength ?? 0;
		const recoil = reducedMotion || firing?.beam ? 0 : strength * (next.weapon === 'rail' ? 5 : next.weapon === 'missile' ? 1.5 : 2.5);
		for (const [weapon, model] of Object.entries(variants)) { model.visible = weapon === next.weapon; model.position.x = -recoil; }
		flash.visible = fitted && strength > 0;
		flash.position.set((next.weapon === 'rail' ? 47 : next.weapon === 'missile' ? 16 : 36) - recoil, next.weapon === 'missile' ? 9 : 6, next.weapon === 'flak' ? -5 : next.weapon === 'missile' ? -8 : 0);
		flash.scale.set(next.weapon === 'rail' ? 13 : next.weapon === 'missile' ? 10 : 6, firing?.beam ? 4 : 3, firing?.beam ? 4 : 3);
		flash.material.opacity = strength * (reducedMotion ? 0.35 : 0.85);
		if (next.weapon) flash.material.color.copy(accents[next.weapon].color);
		secondFlash.visible = flash.visible && (next.weapon === 'flak' || next.weapon === 'missile');
		secondFlash.position.copy(flash.position); secondFlash.position.z *= -1; secondFlash.scale.copy(flash.scale);
		for (const [index, pip] of pips.entries()) pip.visible = fitted && index < next.level;
	};
	update(mount, false);
	return { root, update };
};

export const disposeObject = function (root: Object3D): void {
	const geometries = new Set<BufferGeometry>();
	const materials = new Set<Material>();
	root.traverse(function (object) {
		if (!(object instanceof Mesh || object instanceof Line || object instanceof Points)) return;
		geometries.add(object.geometry);
		const attached: Material[] = Array.isArray(object.material) ? object.material : [object.material];
		for (const material of attached) materials.add(material);
	});
	for (const geometry of geometries) geometry.dispose();
	for (const material of materials) material.dispose();
};
