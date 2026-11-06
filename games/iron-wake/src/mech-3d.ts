import { BoxGeometry, BufferGeometry, EdgesGeometry, Float32BufferAttribute, Group, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Sphere, Vector3 } from 'three';
import { legJoints, mechScale, type WalkerGait } from './gait';
import type { EnemyKind } from './simulation';

export interface MechFeedback { recoil: number; hit: number; heat: number; time: number; reducedMotion: boolean }

export const createMech = function (kind?: EnemyKind, commander = false) {
	const size = kind ? mechScale(kind) : 1;
	const colors = { scout: '#9c6f4e', striker: '#8d5350', siege: '#6b5f60' };
	const root = new Group(); root.name = 'siege-frame';
	const parts: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];
	const geometry = new BoxGeometry(1, 1, 1);
	const edges = new EdgesGeometry(geometry);
	const portGeometry = new PlaneGeometry(1, 1);
	const material = function (color: string, emissive = '#000000') {
		return new MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.45, roughness: 0.66, metalness: 0.32 });
	};
	const steel = material(commander ? '#772f2d' : kind ? colors[kind] : '#738986'); const dark = material('#253239'); const amber = material(commander ? '#bdb6a0' : kind ? '#aa7454' : '#d7ad61');
	const glass = material(kind ? '#ffae7e' : '#9fe5e7', kind ? '#ffae7e' : '#9fe5e7'); const port = material('#101c26');
	const trim = material(kind ? '#c3b6a0' : '#c8cec0');
	const outline = new LineBasicMaterial({ color: '#a9b9b4', transparent: true, opacity: 0.2, depthWrite: false });
	const box = function (parent: Group, x: number, side: number, bottom: number, length: number, breadth: number, height: number, surface: MeshStandardMaterial) {
		const mesh = new Mesh(geometry, surface);
		mesh.position.set(x * size, (bottom + height / 2) * size, side * size); mesh.scale.set(length * size, height * size, breadth * size);
		parts.push(mesh); parent.add(mesh); return mesh;
	};
	const hull = new Group(); hull.name = 'hull'; root.add(hull);
	box(hull, 0, 0, 45, 25, 37, 12, dark);
	const turret = new Group(); turret.name = 'turret'; root.add(turret);
	box(turret, -5, 0, 54, 35, 41, 20, steel);
	box(turret, 17, 0, 53, 34, 27, 16, steel).name = 'cockpit-shell';
	// The visor projects beyond the shell: coincident front faces at X=34
	// otherwise compete for the same depth samples as the turret turns.
	box(turret, 29.25, 0, 64, 10, 23, 6, glass).name = 'cockpit-visor';
	// Layered plates break the chassis into manufactured assemblies. The
	// original visor and shell retain their physical depth separation.
	box(turret, 8, 0, 75, 35, 27, 3, trim);
	for (const side of [-1, 1]) {
		const cheek = box(turret, 13, side * 16, 61, 31, 5, 12, steel); cheek.rotation.z = -0.17;
		const cap = box(turret, -5, side * 22, 68, 28, 5, 9, trim); cap.rotation.x = side * -0.3;
		box(turret, 14, side * 18.8, 62, 18, 1.5, 3, amber);
	}
	box(turret, 26, 0, 56, 22, 28, 5, dark);
	box(turret, 25, 0, 58, 22, 29, 2, amber);
	box(turret, -29, 0, 47, 16, 30, 27, dark);
	for (const side of [-1, 1]) {
		box(turret, -24, side * 19, 50, 11, 7, 24, steel);
		for (let vent = 0; vent < 5; vent++) box(turret, -33, side * 10, 51 + vent * 4.5, 2, 8, 2, trim);
		box(hull, 2, side * 23, 39, 25, 8, 14, steel);
		box(hull, 10, side * 28, 41, 17, 2, 8, amber);
	}
	const barrels: { part: Mesh; x: number }[] = [];
	for (const side of [-1, 1]) {
		box(turret, -7, side * 33, 49, 26, 18, 16, steel);
		const length = kind === 'siege' ? 55 : kind === 'scout' ? 24 : 38;
		const barrel = box(turret, 15, side * 33, 51, length, 8, 8, dark); barrels.push({ part: barrel, x: barrel.position.x });
		const muzzle = box(turret, 15 + length / 2, side * 33, 50, 7, 11, 10, steel); barrels.push({ part: muzzle, x: muzzle.position.x });
		const sleeve = box(turret, 15 + length / 2 - 9, side * 33, 50.7, 4, 9, 8.6, trim); barrels.push({ part: sleeve, x: sleeve.position.x });
		const bore = box(turret, 19 + length / 2, side * 33, 52, 1, 6, 6, port); bore.name = 'gun-bore';
		// Bores are boxes, unlike the front-facing missile-port planes below.
		bore.material = dark;
		barrels.push({ part: bore, x: bore.position.x });
		box(turret, 3, side * 33, 62, 17, 20, 3, trim);
		if (kind === 'scout') {
			box(turret, -11, side * 33, 67, 23, 14, 8, amber);
			box(turret, -14, side * 33, 75, 3, 3, 16, dark);
			continue;
		}
		box(turret, -11, side * 33, 70, 22, 23, 19, amber);
		box(turret, -11, side * 33, 89, 23, 24, 3, trim);
		box(turret, -22.3, side * 33, 71, 1, 16, 15, steel);
		for (const offset of [-7, 0, 7]) for (const z of [75, 82]) {
			// Front-facing surface details sit just outside the rack. FrontSide
			// culling and the shared depth buffer handle every turret heading.
			const detail = new Mesh(portGeometry, port); detail.name = 'missile-port';
			detail.rotation.y = Math.PI / 2; detail.scale.set(4 * size, 4 * size, 1);
			detail.position.set(0.035 * size, (z + 2) * size, (side * 33 + offset) * size); turret.add(detail); parts.push(detail);
		}
	}
	if (kind === 'siege') {
		// A high dorsal gun and wide armored shoulders identify artillery even
		// when its health label is hidden or the player cannot distinguish colors.
		if (!commander) {
			box(turret, -17, 0, 78, 31, 26, 22, dark);
			box(turret, 2, 0, 94, 66, 13, 13, steel);
			box(turret, 36, 0, 93, 9, 19, 15, trim);
			box(turret, 41, 0, 96, 1.5, 11, 9, dark);
		}
		for (const side of [-1, 1]) {
			const shield = box(turret, 12, side * 48, 40, 19, 9, 38, steel); shield.rotation.z = -0.16;
			box(turret, 22, side * 48, 46, 2, 10, 24, amber);
			box(hull, -3, side * 28, 31, 35, 12, 10, dark);
		}
	}
	if (commander) {
		// The command frame carries a dorsal artillery mount and an ivory
		// armored crown. It is recognizable without relying only on color.
		box(turret, -17, 0, 79, 36, 28, 22, dark);
		box(turret, -3, 0, 96, 54, 17, 12, steel);
		box(turret, 24, 0, 95, 8, 21, 14, trim);
		for (const side of [-1, 1]) {
			box(turret, -10, side * 49, 67, 32, 8, 21, steel);
			box(turret, -10, side * 49, 88, 32, 9, 3, trim);
			box(turret, -24, side * 24, 89, 3, 3, 30, amber);
		}
	} else {
		box(turret, -21, -20, 74, 2, 2, kind === 'scout' ? 24 : 19, dark);
		box(turret, -21, -20, kind === 'scout' ? 98 : 93, 3, 3, 2, glass);
	}
	const legs = [0, 1].map(function () {
		const foot = new Group(); root.add(foot);
		box(foot, 0, 0, 0, 38, 18, 7, dark);
		for (const side of [-1, 1]) box(foot, 15, side * 6, 0, 15, 6, 5, steel);
		return {
			foot, upper: box(root, 0, 0, 0, 1, 1, 1, dark), lower: box(root, 0, 0, 0, 1, 1, 1, steel),
			piston: box(root, 0, 0, 0, 1, 1, 1, steel),
			knee: box(root, 0, 0, 0, 14, 17, 9, dark), ankle: box(root, 0, 0, 0, 13, 14, 9, steel),
		};
	});
	const up = new Vector3(0, 1, 0); const start = new Vector3(); const end = new Vector3(); const direction = new Vector3();
	// The articulated parts remain pose handles. Six instanced batches and one
	// edge buffer draw the same surfaces without a draw call for every box.
	for (const part of parts) part.visible = false;
	const orderedParts: typeof parts = [];
	root.traverse(function (object) { if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) orderedParts.push(object); });
	const batches = [steel, dark, amber, glass, port, trim].map(function (surface) {
		const members = orderedParts.filter(function (part) { return part.material === surface; });
		const mesh = new InstancedMesh(surface === port ? portGeometry : geometry, surface, members.length);
		mesh.name = surface === port ? 'missile-port' : surface === glass ? 'cockpit-visor' : surface === steel ? 'armor' : 'frame';
		mesh.boundingSphere = new Sphere(new Vector3(0, 45 * size, 0), 160 * size); root.add(mesh);
		mesh.castShadow = true; mesh.receiveShadow = true;
		return { mesh, members };
	});
	const edged = parts.filter(function (part) { return part.material !== port; });
	const edgeVertices = edges.getAttribute('position');
	const outlineGeometry = new BufferGeometry();
	const outlinePositions = new Float32BufferAttribute(new Float32Array(edged.length * edgeVertices.count * 3), 3);
	outlineGeometry.setAttribute('position', outlinePositions);
	outlineGeometry.boundingSphere = new Sphere(new Vector3(0, 45 * size, 0), 160 * size);
	root.add(new LineSegments(outlineGeometry, outline));
	const inverseRoot = new Matrix4(); const relative = new Matrix4(); const vertex = new Vector3();
	const link = function (mesh: Mesh, width: number) {
		direction.subVectors(end, start); const length = direction.length();
		mesh.position.copy(start).add(end).multiplyScalar(0.5);
		mesh.scale.set(width, length, width); mesh.quaternion.setFromUnitVectors(up, direction.normalize());
	};
	let disposed = false;
	return {
		root,
		pose: function (gait: WalkerGait, heading: number, feedback?: MechFeedback) {
			hull.rotation.y = -gait.body.angle; turret.rotation.y = -heading;
			const recoil = feedback?.reducedMotion ? 0 : feedback?.recoil ?? 0;
			for (const barrel of barrels) barrel.part.position.x = barrel.x - recoil * 7 * size;
			const hit = feedback?.hit ?? 0;
			for (const surface of [steel, amber, trim]) { surface.emissive.set('#ffae73'); surface.emissiveIntensity = hit * 0.8; }
			glass.emissiveIntensity = 0.6 + (feedback?.heat ?? 0) / 170;
			for (const [index, leg] of legs.entries()) {
				const side = index === 0 ? 0 : 1; const foot = gait.feet[side];
				const { hip, knee, ankle } = legJoints(gait.body, foot, side, size);
				const x = gait.body.x; const y = gait.body.y;
				leg.foot.position.set(foot.x - x, foot.lift, foot.y - y); leg.foot.rotation.y = -foot.angle;
				start.set(hip.x - x, hip.z, hip.y - y); end.set(knee.x - x, knee.z, knee.y - y); link(leg.upper, 12 * size);
				start.copy(end); end.set(ankle.x - x, ankle.z, ankle.y - y); link(leg.lower, 14 * size);
				start.set(knee.x - x + Math.cos(gait.body.angle) * 5 * size, knee.z - size, knee.y - y + Math.sin(gait.body.angle) * 5 * size);
				end.y += 3 * size; link(leg.piston, 3 * size);
				leg.knee.position.set(knee.x - x, knee.z + 0.5 * size, knee.y - y); leg.knee.rotation.y = -gait.body.angle;
				leg.ankle.position.set(ankle.x - x, ankle.z + 1.5 * size, ankle.y - y); leg.ankle.rotation.y = -foot.angle;
			}
			root.updateMatrixWorld(true); inverseRoot.copy(root.matrixWorld).invert();
			for (const batch of batches) {
				for (const [index, part] of batch.members.entries()) { relative.multiplyMatrices(inverseRoot, part.matrixWorld); batch.mesh.setMatrixAt(index, relative); }
				batch.mesh.instanceMatrix.needsUpdate = true;
			}
			for (const [index, part] of edged.entries()) {
				relative.multiplyMatrices(inverseRoot, part.matrixWorld);
				for (let i = 0; i < edgeVertices.count; i++) {
					vertex.fromBufferAttribute(edgeVertices, i).applyMatrix4(relative); outlinePositions.setXYZ(index * edgeVertices.count + i, vertex.x, vertex.y, vertex.z);
				}
			}
			outlinePositions.needsUpdate = true;
		},
		dispose: function () {
			if (disposed) return; disposed = true;
			for (const batch of batches) batch.mesh.dispose();
			geometry.dispose(); edges.dispose(); portGeometry.dispose(); outlineGeometry.dispose();
			for (const surface of [steel, dark, amber, glass, port, trim, outline]) surface.dispose();
			root.removeFromParent();
		},
	};
};
