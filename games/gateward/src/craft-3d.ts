import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Enemy, EnemyKind, Escort } from './simulation';

type Point3 = readonly [number, number, number];
// Longitudinal position, half beam, roof, belly. All craft face +X.
type Station = readonly [number, number, number, number];
type Surface = 'core' | 'armor' | 'plate' | 'edge' | 'recess' | 'window' | 'drive' | 'mark';
type Parts = Map<Surface, BufferGeometry[]>;
type Palette = Record<Surface, MeshStandardMaterial>;

const metal = function (color: Point3, emission?: Point3): MeshStandardMaterial {
	return new MeshStandardMaterial({
		color: new Color().setRGB(...color), metalness: 0.42, roughness: 0.72,
		emissive: emission ? new Color().setRGB(...emission) : '#000000',
		emissiveIntensity: emission ? 1.8 : 0,
	});
};

const palette = function (hostile?: EnemyKind): Palette {
	// Linear colors match build-ark.py. Faction color lives on plating and small
	// recognition marks, leaving the same steel, dark seams and warm glazing.
	const plates: Record<EnemyKind, Point3> = {
		raider: [0.27, 0.16, 0.145], bomber: [0.29, 0.225, 0.14],
		armored: [0.235, 0.19, 0.25], flagship: [0.24, 0.155, 0.16],
	};
	return {
		core: metal([0.055, 0.068, 0.081]),
		armor: metal([0.20, 0.225, 0.25]),
		plate: metal(hostile ? plates[hostile] : [0.245, 0.265, 0.285]),
		edge: metal([0.33, 0.355, 0.375]),
		recess: metal([0.012, 0.021, 0.028]),
		window: metal([0.27, 0.16, 0.055], [0.95, 0.57, 0.20]),
		drive: metal([0.55, 0.35, 0.15], [1, 0.72, 0.38]),
		mark: hostile ? metal([0.36, 0.07, 0.045], [0.55, 0.07, 0.035]) : metal([0.075, 0.28, 0.30], [0.12, 0.47, 0.5]),
	};
};

const add = function (parts: Parts, surface: Surface, geometry: BufferGeometry): void {
	const group = parts.get(surface);
	if (group) group.push(geometry);
	else parts.set(surface, [geometry]);
};

const box = function (parts: Parts, surface: Surface, x: number, y: number, z: number, width: number, height: number, depth: number): void {
	const geometry = new BoxGeometry(width, height, depth).toNonIndexed();
	geometry.deleteAttribute('uv');
	geometry.translate(x, y, z);
	add(parts, surface, geometry);
};

const body = function (parts: Parts, surface: Surface, stations: readonly Station[], across = 0): void {
	const rings = stations.map(function ([x, beam, top, bottom]): readonly Point3[] {
		return [
			[x, top, across - beam * 0.64], [x, top, across + beam * 0.64],
			[x, top - (top - bottom) * 0.26, across + beam], [x, bottom + (top - bottom) * 0.3, across + beam],
			[x, bottom, across + beam * 0.55], [x, bottom, across - beam * 0.55],
			[x, bottom + (top - bottom) * 0.3, across - beam], [x, top - (top - bottom) * 0.26, across - beam],
		];
	});
	const positions: number[] = [];
	const face = function (vertices: readonly Point3[]) {
		const first = vertices[0];
		if (!first) return;
		for (let index = 1; index < vertices.length - 1; index++) {
			const second = vertices[index]; const third = vertices[index + 1];
			if (second && third) positions.push(...first, ...second, ...third);
		}
	};
	const start = rings[0]; const end = rings.at(-1);
	if (!start || !end) throw new Error('A craft hull needs stations');
	face([...start].reverse()); face(end);
	for (const [index, ring] of rings.entries()) {
		const next = rings[index + 1];
		if (!next) continue;
		for (const [corner, a] of ring.entries()) {
			const b = ring[(corner + 1) % ring.length]; const c = next[(corner + 1) % ring.length]; const d = next[corner];
			if (b && c && d) face([a, b, c, d]);
		}
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
	geometry.computeVertexNormals();
	add(parts, surface, geometry);
};

const plate = function (parts: Parts, surface: Surface, x: number, y: number, z: number, length: number, width: number, height: number): void {
	const back = x - length / 2; const front = x + length / 2; const bevel = Math.min(length, width) * 0.12;
	body(parts, surface, [
		[back, width * 0.34, y + height * 0.3, y - height * 0.3],
		[back + bevel, width / 2, y + height / 2, y - height / 2],
		[front - bevel, width / 2, y + height / 2, y - height / 2],
		[front, width * 0.34, y + height * 0.3, y - height * 0.3],
	], z);
};

const drive = function (parts: Parts, x: number, y: number, z: number, size: number): void {
	plate(parts, 'armor', x + size * 0.25, y, z, size * 1.6, size * 1.45, size * 1.25);
	box(parts, 'recess', x - size * 0.58, y, z, size * 0.1, size * 0.85, size);
	box(parts, 'drive', x - size * 0.65, y, z, size * 0.08, size * 0.52, size * 0.65);
	box(parts, 'edge', x - size * 0.75, y, z, size * 0.1, size * 0.65, size * 0.1);
};

const vents = function (parts: Parts, x: number, y: number, z: number, count: number, size: number): void {
	box(parts, 'recess', x, y, z, count * size * 0.65, size * 0.3, size * 1.8);
	for (let index = 0; index < count; index++) {
		box(parts, 'edge', x + (index - (count - 1) / 2) * size * 0.65, y + size * 0.2, z, size * 0.22, size * 0.16, size * 1.65);
	}
};

const finish = function (name: string, parts: Parts, materials: Palette): Group {
	const root = new Group(); root.name = name;
	// Batch disconnected details by material, as the Blender ark does. No model
	// shares GPU resources with another: existing removal/disposal remains valid.
	for (const [surface, geometries] of parts) {
		const merged = mergeGeometries(geometries);
		for (const geometry of geometries) geometry.dispose();
		if (!merged) throw new Error(`Unable to batch craft ${surface}`);
		const mesh = new Mesh(merged, materials[surface]); mesh.name = surface;
		mesh.receiveShadow = true; root.add(mesh);
	}
	// Unused materials have no scene owner to dispose them later.
	const used = new Set(Array.from(parts.keys(), function (surface) { return materials[surface]; }));
	for (const material of Object.values(materials)) if (!used.has(material)) material.dispose();
	return root;
};

export const createEscort = function (escort: Escort): Group {
	const parts: Parts = new Map();
	if (escort.kind === 'interceptor') {
		// Small swept wings, paired drives and a narrow glazed central fuselage.
		body(parts, 'core', [[-10, 3, 2, -2], [-4, 5.5, 3, -2.5], [10, 2.4, 1, -1.5], [15, 0.8, 0, -1]]);
		for (const side of [-1, 1]) {
			body(parts, 'plate', [[-11, 1, 0.8, -1.5], [-8, 3.4, 1.4, -1.5], [1, 1, 0.8, -0.8]], side * 5);
			plate(parts, 'armor', -1.5, 2, side * 3.1, 14, 2.2, 1.9);
			box(parts, 'mark', -6, 1.6, side * 6, 2, 0.4, 2.7);
			box(parts, 'recess', 3, 0.3, side * 4, 9, 0.9, 0.9);
			drive(parts, -10, -0.2, side * 2.4, 2.5);
		}
		plate(parts, 'recess', 0, 3.1, 0, 9, 3.8, 2.2);
		plate(parts, 'window', 1, 4.1, 0, 5, 2.4, 1.1);
		plate(parts, 'edge', 7.5, 1.7, 0, 6, 2.5, 1.4);
		vents(parts, -6, 3.1, 0, 3, 0.9);
	} else {
		// Guardian: a broad, layered patrol hull with twin shoulder cannon pods.
		body(parts, 'core', [[-20, 8, 3, -3], [-16, 13, 4.5, -4.5], [10, 12, 4, -4], [23, 4, 1, -2]]);
		for (const side of [-1, 1]) {
			for (const x of [-12, -2, 8]) plate(parts, 'plate', x, 2.7, side * 9.5, 9.1, 6.3, 4.2);
			plate(parts, 'armor', 1, 5.5, side * 7.3, 15, 4.5, 3.8);
			box(parts, 'recess', 11, 5.6, side * 7.3, 13, 1.5, 1.7);
			box(parts, 'edge', 7, 6.5, side * 7.3, 6, 0.7, 2.2);
			box(parts, 'mark', 9.5, 5.2, side * 10, 2.3, 0.6, 3.8);
			drive(parts, -17.8, -0.5, side * 7, 5);
			for (const x of [-11, -6, -1]) box(parts, 'window', x, 1.2, side * 12.8, 1.5, 0.8, 0.35);
		}
		plate(parts, 'armor', 6, 4.8, 0, 26, 10, 3.5);
		plate(parts, 'recess', -5, 6.8, 0, 13, 8, 5);
		plate(parts, 'window', -3, 9.1, 0, 8, 6, 1.1);
		plate(parts, 'plate', -6, 10, 0, 12, 8.5, 1.6);
		vents(parts, -14, 5.8, 0, 4, 1.5);
		vents(parts, 10, 6.8, 0, 3, 1.3);
	}
	return finish(`Escort_${escort.kind}_${escort.id}`, parts, palette());
};

export const createEnemy = function (enemy: Enemy): Group {
	const parts: Parts = new Map();
	if (enemy.kind === 'raider') {
		body(parts, 'core', [[-12, 4, 1.5, -2.5], [-6, 7, 2.5, -2.5], [13, 3, 1.2, -1.5], [18, 0.8, 0, -1]]);
		for (const side of [-1, 1]) {
			body(parts, 'plate', [[-13, 1.3, 1.5, -1.8], [-10, 3.6, 2.2, -2], [9, 1.4, 0.6, -1]], side * 6.5);
			plate(parts, 'armor', -4, 2.8, side * 4.2, 12, 3.5, 2.2);
			box(parts, 'recess', 4, 1.1, side * 6, 12, 1.2, 1.3);
			box(parts, 'mark', -6, 3.8, side * 4.2, 2.3, 0.4, 2.7);
			drive(parts, -10, -0.3, side * 3.4, 3.1);
		}
		plate(parts, 'recess', -1, 3.6, 0, 10, 4.8, 2.7);
		plate(parts, 'window', 1, 4.8, 0, 4.5, 3, 1);
		vents(parts, -7, 3.7, 0, 3, 1.1);
	} else if (enemy.kind === 'bomber') {
		body(parts, 'core', [[-15, 5, 2, -3], [-6, 10, 3.5, -3], [15, 4, 2, -2], [22, 1.5, 0, -1.5]]);
		for (const side of [-1, 1]) {
			body(parts, 'plate', [[-18, 1.8, 1, -2], [-13, 6.5, 2.4, -2.8], [5, 2.3, 1, -2]], side * 12);
			plate(parts, 'recess', -1, 2, side * 11, 22, 7, 7);
			plate(parts, 'armor', -2, 5.1, side * 11, 20, 7.3, 2.7);
			for (const z of [-1.7, 1.7]) {
				box(parts, 'recess', 10.2, 2, side * 11 + z, 0.6, 3.2, 2.3);
				box(parts, 'window', 10.6, 2, side * 11 + z, 0.25, 1.2, 1.2);
			}
			box(parts, 'mark', 2, 6.5, side * 11, 2, 0.4, 5.5);
			vents(parts, -6, 6.5, side * 11, 3, 1.5);
			drive(parts, -16, -0.5, side * 10, 4.2);
		}
		plate(parts, 'armor', 1, 4.7, 0, 19, 8, 3);
		plate(parts, 'window', 5, 6.4, 0, 5, 4.5, 1.1);
		vents(parts, -6, 6.5, 0, 3, 1.3);
	} else if (enemy.kind === 'armored') {
		body(parts, 'core', [[-22, 13, 4, -5], [-16, 20, 5.5, -5.5], [16, 18, 5.5, -5], [30, 6, 1.8, -3]]);
		for (const side of [-1, 1]) {
			for (const x of [-15, -4, 7, 17]) plate(parts, 'plate', x, 3.6, side * 14.5, 10.2, 9, 5.8);
			plate(parts, 'edge', 1, -2.5, side * 18, 32, 3, 2);
			plate(parts, 'armor', -2, 7, side * 11, 22, 7, 4);
			box(parts, 'recess', 13, 7, side * 11, 14, 2, 2.3);
			box(parts, 'mark', 8, 9.2, side * 11, 3.5, 0.4, 5);
			drive(parts, -19.5, -1, side * 10, 6);
			vents(parts, -10, 9.2, side * 11, 4, 1.5);
		}
		plate(parts, 'armor', 4, 6.6, 0, 31, 16, 4);
		plate(parts, 'recess', -3, 9, 0, 17, 12, 6);
		plate(parts, 'window', 1, 11.8, 0, 8, 8.5, 1);
		plate(parts, 'plate', -4, 12.7, 0, 16, 12, 1.8);
		vents(parts, 14, 9, 0, 4, 1.7);
	} else {
		// The flagship carries the ark's architectural density on a shorter, wider
		// hull: armored shoulders, recessed belt, aft bridge, paired batteries.
		body(parts, 'core', [[-46, 20, 6, -9], [-35, 33, 9, -10], [15, 31, 9, -9], [44, 20, 6, -7], [58, 9, 2, -4]]);
		for (const side of [-1, 1]) {
			for (const x of [-30, -14, 2, 18, 34]) {
				const beam = x > 20 ? 18 : 25;
				plate(parts, 'plate', x, 6.1, side * beam, 14.7, 14, 6.8);
				plate(parts, 'armor', x, -6, side * beam * 0.9, 14.7, 12, 4.5);
				box(parts, 'window', x, 0, side * (beam + 6), 3, 1.1, 0.5);
			}
			for (const x of [-13, 12]) {
				plate(parts, 'armor', x, 12, side * 19, 17, 10, 5);
				for (const z of [-2, 2]) box(parts, 'recess', x + 10, 12, side * 19 + z, 14, 1.8, 1.6);
				box(parts, 'mark', x - 3, 14.7, side * 19, 2, 0.5, 7);
			}
			for (const z of [10, 23]) drive(parts, -42, -1.5, side * z, 8);
			vents(parts, -30, 10.2, side * 18, 4, 2.1);
		}
		plate(parts, 'armor', 13, 10.3, 0, 68, 24, 5.2);
		plate(parts, 'armor', -20, 14, 0, 30, 23, 10);
		plate(parts, 'recess', -22, 20, 0, 24, 21, 5);
		plate(parts, 'window', -20, 22.4, 0, 23, 20, 0.9);
		plate(parts, 'plate', -23, 24, 0, 29, 25, 2.5);
		for (const x of [-29, -22, -15]) box(parts, 'recess', x, 23, 10.2, 0.8, 1.8, 1.5);
		box(parts, 'edge', -28, 28.5, -6, 0.8, 8, 0.8);
		for (const x of [3, 21, 38]) vents(parts, x, 13.2, 0, 4, 2.2);
	}
	return finish(`Hostile_${enemy.kind}_${enemy.id}`, parts, palette(enemy.kind));
};
