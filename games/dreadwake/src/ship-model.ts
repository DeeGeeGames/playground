import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CEL } from './visual-theme';
import { MOUNT_SOCKETS, WEAPONS, WEAPON_IDS, type WeaponId } from './weapons';

export type HullKind = 'player' | 'frigate' | 'cruiser' | 'command';
type Outline = readonly (readonly [number, number])[];

// The meshes remain an adapter for the existing planar simulation. Color planes
// and ink carry the form; lighting, metal textures and bloom are unnecessary.
export const createShipModels = function () {
	const geometries = new Set<THREE.BufferGeometry>();
	const materials = new Set<THREE.Material>();
	const ownGeometry = function <T extends THREE.BufferGeometry>(geometry: T): T { geometries.add(geometry); return geometry; };
	const material = function (color: string) {
		const value = new THREE.MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
		materials.add(value); return value;
	};
	const ink = new THREE.LineBasicMaterial({ color: CEL.ink }); materials.add(ink);
	const shell = new THREE.ShaderMaterial({
		uniforms: { ink: { value: new THREE.Color(CEL.ink) } }, side: THREE.BackSide,
		vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * 0.9, 1.0); }',
		fragmentShader: 'uniform vec3 ink; void main() { gl_FragColor = vec4(ink, 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
	}); materials.add(shell);
	const make = function (kind: HullKind) {
		const player = kind === 'player'; const small = kind === 'frigate'; const command = kind === 'command';
		const length = player ? 220 : small ? 115 : 170; const width = player ? 90 : small ? 42 : 58;
		const top = material(player ? CEL.top : CEL.hostile); const side = material(player ? CEL.side : CEL.hostileSide);
		const dark = material(CEL.dark); const shadow = material(CEL.ink); const amber = material(CEL.amber);
		const emitter = material(player ? CEL.mint : CEL.amber); const cream = material(CEL.cream);
		const bins = new Map<THREE.Material, THREE.BufferGeometry[]>(); const edges: THREE.BufferGeometry[] = []; const contours: THREE.BufferGeometry[] = [];
		const add = function (source: THREE.BufferGeometry, paint: THREE.Material, shade = side, outline = true) {
			const geometry = source.index ? source.toNonIndexed() : source;
			if (geometry !== source) source.dispose();
			const normals = geometry.getAttribute('normal'); const positions = geometry.getAttribute('position');
			const groups = new Map<THREE.Material, number[]>();
			for (let i = 0; i < positions.count; i += 3) {
				const color = normals.getY(i) > 0.4 ? paint : normals.getX(i) < -0.4 ? dark : shade;
				const vertices = groups.get(color) ?? [];
				for (let j = 0; j < 3; j++) vertices.push(positions.getX(i + j), positions.getY(i + j), positions.getZ(i + j));
				groups.set(color, vertices);
			}
			for (const [color, vertices] of groups) {
				const part = new THREE.BufferGeometry(); part.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); part.computeVertexNormals();
				const pieces = bins.get(color) ?? []; pieces.push(part); bins.set(color, pieces);
			}
			if (outline) { edges.push(new THREE.EdgesGeometry(geometry, 25)); contours.push(geometry.clone()); }
			geometry.dispose();
		};
		const hull = function (outline: Outline, bottom: number, height: number, paint = top, shade = side) {
			const shape = new THREE.Shape();
			for (const [i, point] of outline.entries()) {
				if (i === 0) shape.moveTo(point[0] * length, -point[1] * width);
				else shape.lineTo(point[0] * length, -point[1] * width);
			}
			shape.closePath();
			const geometry = new THREE.ExtrudeGeometry(shape, { depth: height - bottom, bevelEnabled: false, steps: 1, curveSegments: 1 });
			geometry.rotateX(-Math.PI / 2); geometry.translate(0, bottom, 0); add(geometry, paint, shade);
		};
		const block = function (x: number, y: number, z: number, sx: number, sy: number, sz: number, paint: THREE.MeshBasicMaterial, outline = true) {
			const geometry = new THREE.BoxGeometry(sx, sy, sz); geometry.translate(x, y, z); add(geometry, paint, paint, outline);
		};
		const mirror = function (outline: Outline, sign: number): Outline { return outline.map(function ([x, z]) { return [x, z * sign] as const; }); };
		const h = small ? 0.75 : 1;
		hull([[-0.48, -0.17], [0.29, -0.2], [0.57, -0.07], [0.57, 0.07], [0.29, 0.2], [-0.48, 0.17], [-0.55, 0]], 0, 22 * h, dark, dark);
		for (const sign of [-1, 1]) {
			hull(mirror([[-0.53, 0.23], [-0.39, 0.18], [0.2, 0.2], [small ? 0.2 : player ? 0.35 : 0.3, 0.34], [0.1, small ? 0.6 : 0.47], [-0.47, 0.49], [-0.57, 0.38]], sign), 3, 19 * h);
			hull(mirror([[-0.03, 0.18], [0.4, 0.09], [player ? 0.59 : 0.48, 0.1], [0.36, player ? 0.33 : 0.39], [0.04, 0.34]], sign), 16 * h, 27 * h);
			hull(mirror([[-0.01, 0.21], [0.08, 0.2], [0.11, 0.33], [0.02, 0.34]], sign), 27 * h, 27.5 * h, amber);
			// Chamfered drive collar and a genuine recessed rear aperture.
			hull(mirror([[-0.56, 0.29], [-0.535, 0.22], [-0.405, 0.22], [-0.38, 0.29], [-0.38, 0.42], [-0.405, 0.49], [-0.535, 0.49], [-0.56, 0.42]], sign), 4, 23 * h, side, dark);
			block(-length * 0.561, 12 * h, sign * width * 0.355, 0.7, 12 * h, width * 0.15, shadow, false);
			block(-length * 0.565, 12 * h, sign * width * 0.355, 0.6, 8 * h, width * 0.105, emitter, false);
			for (let i = 0; i < (player ? 0 : 4); i++) {
				const x = player ? 64 - i * 25 : length * (0.28 - i * (small ? 0.15 : 0.18)); const z = sign * width * 0.405;
				const size = small ? 7 : player ? 11 : 9;
				const turret = new THREE.CylinderGeometry(size * 0.65, size * 0.7, 7 * h, 8); turret.translate(x, 23 * h, z); add(turret, side);
				for (const offset of [-size * 0.26, size * 0.26]) {
					const barrel = new THREE.CylinderGeometry(1.45 * h, 1.45 * h, width * 0.08, 6); barrel.rotateX(Math.PI / 2); barrel.translate(x + offset, 24 * h, z + sign * (width * 0.055 + 2.5 * h)); add(barrel, top, top, false);
					const cap = new THREE.CylinderGeometry(1.7 * h, 1.7 * h, 1.3, 6); cap.rotateX(Math.PI / 2); cap.translate(x + offset, 24 * h, z + sign * (width * 0.095 + 2.5 * h)); add(cap, shadow, shadow, false);
				}
			}
			for (let i = 0; i < 3; i++) block(length * (-0.36 + i * 0.045), 20 * h, sign * width * 0.255, 2, 0.8, width * 0.07, amber);
			for (const x of [0.16, 0.32]) block(length * x, 27.3 * h, sign * width * 0.225, 0.7, 0.4, width * 0.12, side, false);
		}
		hull([[-0.4, 0], [-0.32, -0.12], [0.24, -0.09], [0.43, 0], [0.24, 0.09], [-0.32, 0.12]], 21 * h, 33 * h);
		hull([[-0.31, -0.023], [0.24, -0.023], [0.29, 0], [0.24, 0.023], [-0.31, 0.023]], 33 * h, 33.4 * h, dark);
		block(-length * 0.21, 33.7 * h, 0, length * 0.16, 0.5, width * 0.025, emitter, false);
		hull([[-0.08, -0.085], [0.065, -0.085], [0.14, -0.038], [0.14, 0.038], [0.065, 0.085], [-0.08, 0.085], [-0.115, 0]], 33 * h, 40 * h);
		block(length * 0.141, 37 * h, 0, 0.8, 3 * h, width * 0.052, emitter, false);
		block(length * 0.572, 10 * h, 0, 0.8, 7 * h, width * 0.09, amber, false);
		if (command) for (const sign of [-1, 1]) block(-length * 0.21, 38, sign * width * 0.11, length * 0.1, 12, 4, amber);
		if (player) for (const socket of MOUNT_SOCKETS) {
			const recess = new THREE.CylinderGeometry(6.7, 7.7, 2.4, 12); recess.translate(socket.forward, 22.5, socket.across); add(recess, shadow, dark);
			const ring = new THREE.RingGeometry(5.1, 7.1, 12); ring.rotateX(-Math.PI / 2); ring.translate(socket.forward, 24, socket.across); add(ring, side, side, false);
		}
		const group = new THREE.Group();
		if (player) for (const socket of MOUNT_SOCKETS) {
			const mount = new THREE.Group(); mount.name = `mount-${socket.index}`;
			mount.position.set(socket.forward, 24, socket.across); group.add(mount);
		}
		for (const [paint, pieces] of bins) {
			const merged = mergeGeometries(pieces);
			for (const piece of pieces) piece.dispose();
			if (!merged) throw new Error('Could not assemble Cel Fleet hull');
			ownGeometry(merged); group.add(new THREE.Mesh(merged, paint));
		}
		const contour = mergeGeometries(contours); for (const part of contours) part.dispose();
		if (contour) group.add(new THREE.Mesh(ownGeometry(contour), shell));
		const lineGeometry = mergeGeometries(edges); for (const edge of edges) edge.dispose();
		if (lineGeometry) group.add(new THREE.LineSegments(ownGeometry(lineGeometry), ink));
		const exhaust = new THREE.Group(); exhaust.name = 'exhaust'; group.add(exhaust);
		for (const sign of [-1, 1]) {
			const nozzle = new THREE.Group(); nozzle.position.set(-length * 0.57, 12 * h, sign * width * 0.355);
			for (const [radius, distance, paint] of [[4 * h, 42, emitter], [2 * h, 27, cream]] as const) {
				const geometry = new THREE.ConeGeometry(radius, distance, 4); geometry.rotateZ(Math.PI / 2); geometry.translate(-distance / 2, 0, 0);
				const plume = new THREE.Mesh(ownGeometry(geometry), paint); plume.scale.y = 0.5; nozzle.add(plume);
			}
			exhaust.add(nozzle);
		}
		const scars = new THREE.Group(); scars.name = 'scars'; group.add(scars);
		for (let i = 0; i < 6; i++) {
			const scar = new THREE.Group();
			const hole = new THREE.Mesh(ownGeometry(new THREE.CircleGeometry(2.5 + i % 2, 5)), shadow); hole.rotation.x = -Math.PI / 2; hole.scale.x = 1.6; scar.add(hole);
			const fissure = new THREE.Mesh(ownGeometry(new THREE.BoxGeometry(3, 0.4, 0.6)), amber); fissure.position.y = 0.2; fissure.rotation.y = 0.7; scar.add(fissure);
			scar.position.set(length * (0.17 + i % 3 * 0.055), 27.8 * h, (i < 3 ? -1 : 1) * width * 0.22); scars.add(scar);
		}
		return group;
	};
	const prototypes: Record<HullKind, THREE.Group> = { player: make('player'), frigate: make('frigate'), cruiser: make('cruiser'), command: make('command') };
	// One shared prototype per family. Fitting a socket clones objects, never GPU
	// storage, and empty sockets contain only their permanent recessed ring.
	const turretPrototypes = new Map<WeaponId, THREE.Group>();
	for (const id of WEAPON_IDS) {
		const turret = new THREE.Group(); const body = material(CEL.top); const dark = material(CEL.dark);
		const accent = material(WEAPONS[id].color); const recess = material(CEL.ink);
		const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
		const part = function (geometry: THREE.BufferGeometry, paint: THREE.Material) {
			const pieces = bins.get(paint) ?? []; pieces.push(geometry); bins.set(paint, pieces);
		};
		const box = function (x: number, y: number, z: number, length: number, height: number, width: number, paint: THREE.Material) {
			const geometry = new THREE.BoxGeometry(length, height, width); geometry.translate(x, y, z); part(geometry, paint);
		};
		const tube = function (x: number, y: number, z: number, radius: number, length: number, paint: THREE.Material) {
			const geometry = new THREE.CylinderGeometry(radius, radius, length, 8); geometry.rotateZ(-Math.PI / 2); geometry.translate(x, y, z); part(geometry, paint);
		};
		const base = new THREE.CylinderGeometry(5, 5.8, 4, 8); base.translate(0, 2, 0); part(base, dark);
		if (id === 'rail') {
			box(0, 6, 0, 12, 6, 10, body);
			for (const z of [-3.3, 3.3]) { box(13, 6, z, 24, 2.7, 2.8, dark); box(13, 7.5, z, 20, 0.7, 1, accent); }
		} else if (id === 'rattler') {
			box(-1, 5, 0, 10, 5, 9, body);
			for (const [y, z] of [[5, -2], [5, 2], [8, 0]] as const) { tube(10, y, z, 1.4, 18, dark); tube(19.5, y, z, 1.5, 1, accent); }
		} else if (id === 'flak') {
			box(-1, 5, 0, 11, 5, 13, body);
			for (const z of [-4, 4]) { tube(8, 7, z, 2.8, 10, dark); tube(13.5, 7, z, 3.2, 1.7, accent); }
		} else if (id === 'seeker') {
			box(0, 6, 0, 13, 8, 12, body);
			for (const x of [-3.3, 3.3]) for (const z of [-3, 3]) { box(x, 10.2, z, 4.5, 0.6, 4.2, recess); box(x, 10.6, z, 2.2, 0.4, 2, accent); }
		} else if (id === 'torpedo') {
			box(4, 6, 0, 23, 8, 10, body); box(16, 6, 0, 1, 6.2, 8.2, recess); tube(16.6, 6, 0, 2.2, 0.8, accent);
			box(0, 10.3, 0, 15, 0.6, 2, dark);
		} else if (id === 'spark') {
			box(0, 6, 0, 10, 7, 8, body); tube(9, 7, 0, 2.5, 12, dark); tube(15.5, 7, 0, 3, 1.4, accent);
		} else if (id === 'helios') {
			box(0, 6, 0, 13, 8, 11, body);
			for (const z of [-5, 5]) { box(8, 8, z, 21, 5, 3.4, dark); box(6, 10.7, z, 13, 0.6, 2, accent); }
			tube(8, 7, 0, 3.4, 11, body); tube(14, 7, 0, 3.1, 1, accent);
		} else {
			box(-1, 5, 0, 10, 5, 9, body); tube(7, 7, 0, 1.8, 14, dark);
			for (const x of [4, 9, 14]) {
				const coil = new THREE.TorusGeometry(3.7, 1.05, 5, 10); coil.rotateY(Math.PI / 2); coil.translate(x, 7, 0); part(coil, accent);
			}
		}
		const edgeParts: THREE.BufferGeometry[] = [];
		for (const [paint, pieces] of bins) {
			const merged = mergeGeometries(pieces); for (const piece of pieces) piece.dispose();
			if (!merged) throw new Error(`Could not assemble ${id} turret`);
			turret.add(new THREE.Mesh(ownGeometry(merged), paint)); edgeParts.push(new THREE.EdgesGeometry(merged, 30));
		}
		const edgeGeometry = mergeGeometries(edgeParts); for (const edge of edgeParts) edge.dispose();
		if (edgeGeometry) turret.add(new THREE.LineSegments(ownGeometry(edgeGeometry), ink));
		turretPrototypes.set(id, turret);
	}
	return { prototypes, turretPrototypes, dispose: function () { for (const geometry of geometries) geometry.dispose(); for (const value of materials) value.dispose(); } };
};
