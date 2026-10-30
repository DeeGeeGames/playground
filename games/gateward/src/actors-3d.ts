import { BoxGeometry, BufferGeometry, CylinderGeometry, ExtrudeGeometry, Group, Line, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Points, Shape, TorusGeometry } from 'three';
import { DECK_HEIGHT, TURRET_HEIGHT } from './projection';
import type { Enemy, Escort, Mount, Weapon } from './simulation';

type Outline = readonly (readonly [number, number])[];
type SolidMaterial = MeshStandardMaterial | MeshBasicMaterial;

export interface TurretVisual {
	readonly root: Group;
	readonly update: (mount: Mount, selected: boolean) => void;
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
	const accents: Record<Weapon, MeshBasicMaterial> = { flak: light('#91e3da'), rail: light('#cdb6ef'), missile: light('#edc589') };
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

	const barbette = new Mesh(new CylinderGeometry(15, 17, TURRET_HEIGHT - DECK_HEIGHT, 16), steel);
	barbette.position.y = (TURRET_HEIGHT - DECK_HEIGHT) / 2;
	root.add(barbette);
	const pivot = new Group();
	pivot.name = 'TurretAim';
	pivot.position.y = TURRET_HEIGHT - DECK_HEIGHT;
	root.add(pivot);
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

	const variants: Record<Weapon, Group> = { flak, rail, missile };
	const pips = Array.from({ length: 3 }, function (_, index) {
		return addBox(root, box, indicator, (index - 1) * 5, TURRET_HEIGHT - DECK_HEIGHT + 1.2, 16.2, 3, 1.5, 2.5);
	});
	const update = function (next: Mount, selected: boolean) {
		root.position.set(next.x, DECK_HEIGHT, next.y);
		const fitted = next.weapon !== undefined;
		empty.visible = !fitted;
		barbette.visible = fitted;
		pivot.visible = fitted;
		pivot.rotation.y = -next.aim;
		ring.position.y = fitted ? TURRET_HEIGHT - DECK_HEIGHT + 0.5 : 1.6;
		indicator.color.set(selected ? '#d6efad' : next.weapon === 'rail' ? '#cdb6ef' : next.weapon === 'missile' ? '#edc589' : '#91e3da');
		for (const [weapon, model] of Object.entries(variants)) model.visible = weapon === next.weapon;
		for (const [index, pip] of pips.entries()) pip.visible = fitted && index < next.level;
	};
	update(mount, false);
	return { root, update };
};

export const createEnemy = function (enemy: Enemy): Group {
	const root = new Group();
	root.name = `Hostile_${enemy.kind}_${enemy.id}`;
	const box = new BoxGeometry(1, 1, 1);
	const color = enemy.kind === 'armored' ? '#a378a4' : enemy.kind === 'bomber' ? '#c99267' : '#ae626b';
	const shell = armor(color);
	const dark = armor('#493742');
	const bright = armor(enemy.kind === 'armored' ? '#c5a6c8' : '#e3a88f');
	const engine = light('#efb38d');

	if (enemy.kind === 'flagship') {
		addHull(root, [[-46, -22], [-18, -35], [45, -15], [58, 0], [45, 15], [-18, 35], [-46, 22], [-22, 0]], 18, shell);
		addHull(root, [[-25, -13], [20, -13], [30, 0], [20, 13], [-25, 13]], 13, dark, 12);
		addBox(root, box, bright, -12, 22, 0, 20, 7, 18);
		addBox(root, box, engine, -10, 26, 0, 14, 1.2, 12);
		for (const z of [-21, 21]) {
			addBox(root, box, dark, -10, 10, z, 15, 7, 9);
			addBox(root, box, bright, 2, 11, z, 21, 3, 3);
			addBox(root, box, engine, -40, -1, z / 1.5, 2, 8, 8);
		}
		return root;
	}
	if (enemy.kind === 'armored') {
		addHull(root, [[-22, -20], [17, -20], [30, 0], [17, 20], [-22, 20]], 11, shell);
		addHull(root, [[-12, -10], [10, -10], [17, 0], [10, 10], [-12, 10]], 7, bright, 7);
		for (const z of [-18, 18]) addBox(root, box, dark, -1, 0, z, 29, 8, 5);
		addBox(root, box, engine, -22.5, 0, 0, 1.5, 5, 13);
		return root;
	}
	if (enemy.kind === 'bomber') {
		addHull(root, [[-18, -20], [0, -12], [22, 0], [0, 12], [-18, 20], [-9, 0]], 6, shell);
		for (const z of [-11, 11]) {
			addBox(root, box, dark, -3, 2, z, 20, 7, 6);
			addBox(root, box, engine, -14, 2, z, 1.5, 4, 4);
		}
		addBox(root, box, bright, 4, 5, 0, 11, 3, 7);
		return root;
	}
	addHull(root, [[-13, -11], [18, 0], [-13, 11], [-5, 0]], 5, shell);
	addBox(root, box, dark, 0, 2.5, 0, 12, 2, 7);
	addBox(root, box, bright, 0, 4.3, 0, 9, 1.5, 5);
	addBox(root, box, engine, -9, 0, 0, 2, 3, 5);
	return root;
};

export const createEscort = function (escort: Escort): Group {
	const root = new Group();
	root.name = `Escort_${escort.kind}_${escort.id}`;
	const box = new BoxGeometry(1, 1, 1);
	const guardian = escort.kind === 'guardian';
	const shell = armor(guardian ? '#7296c5' : '#7fc6c3');
	const dark = armor('#2b4a62');
	const bright = light(guardian ? '#abd5ef' : '#a5ebe1');
	if (guardian) {
		addHull(root, [[-20, -13], [10, -13], [23, 0], [10, 13], [-20, 13], [-13, 0]], 9, shell);
		addBox(root, box, dark, -3, 6, 0, 15, 6, 11);
		addBox(root, box, shell, 10, 7, 0, 18, 3, 3);
		for (const z of [-8, 8]) addBox(root, box, bright, -18, 0, z, 2, 4, 4);
		addBox(root, box, bright, -1, 9.3, 0, 7, 0.8, 7);
		return root;
	}
	addHull(root, [[-11, -8], [15, 0], [-11, 8], [-5, 0]], 4, shell);
	addBox(root, box, dark, 1, 3, 0, 8, 2.5, 4);
	addBox(root, box, bright, -7, 0, 0, 2, 2, 4);
	return root;
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
