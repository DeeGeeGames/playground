import { BoxGeometry, BufferGeometry, EdgesGeometry, Float32BufferAttribute, Group, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Sphere, Vector3 } from 'three';
import { legJoints, mechScale, type WalkerGait } from './gait';
import type { EnemyKind } from './simulation';

export const createMech = function (kind?: EnemyKind) {
	const size = kind ? mechScale(kind) : 1;
	const colors = { scout: '#b07961', striker: '#997059', siege: '#886065' };
	const root = new Group(); root.name = 'siege-frame';
	const parts: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];
	const geometry = new BoxGeometry(1, 1, 1);
	const edges = new EdgesGeometry(geometry);
	const portGeometry = new PlaneGeometry(1, 1);
	const material = function (color: string, emissive = '#000000') {
		return new MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.25, roughness: 0.85, metalness: 0.15 });
	};
	const steel = material(kind ? colors[kind] : '#546879'); const dark = material('#263744'); const amber = material(kind ? colors[kind] : '#c79555');
	const glass = material(kind ? '#ffae7e' : '#9fe5e7', kind ? '#ffae7e' : '#9fe5e7'); const port = material('#101c26');
	const outline = new LineBasicMaterial({ color: '#7d91a0', transparent: true, opacity: 0.55 });
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
	for (const side of [-1, 1]) {
		box(turret, -7, side * 33, 49, 26, 18, 16, steel);
		box(turret, 15, side * 33, 51, 35, 8, 8, dark);
		box(turret, -11, side * 33, 70, 22, 23, 19, amber);
		for (const offset of [-7, 0, 7]) for (const z of [75, 82]) {
			// Front-facing surface details sit just outside the rack. FrontSide
			// culling and the shared depth buffer handle every turret heading.
			const detail = new Mesh(portGeometry, port); detail.name = 'missile-port';
			detail.rotation.y = Math.PI / 2; detail.scale.set(4 * size, 4 * size, 1);
			detail.position.set(0.035 * size, (z + 2) * size, (side * 33 + offset) * size); turret.add(detail); parts.push(detail);
		}
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
	// The articulated parts remain pose handles. Five instanced batches and one
	// edge buffer draw the same surfaces without a draw call for every box.
	for (const part of parts) part.visible = false;
	const batches = [steel, dark, amber, glass, port].map(function (surface) {
		const members = parts.filter(function (part) { return part.material === surface; });
		const mesh = new InstancedMesh(surface === port ? portGeometry : geometry, surface, members.length);
		mesh.name = surface === port ? 'missile-port' : surface === glass ? 'cockpit-visor' : surface === steel ? 'armor' : 'frame';
		mesh.boundingSphere = new Sphere(new Vector3(0, 45 * size, 0), 160 * size); root.add(mesh);
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
		pose: function (gait: WalkerGait, heading: number) {
			hull.rotation.y = -gait.body.angle; turret.rotation.y = -heading;
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
			for (const surface of [steel, dark, amber, glass, port, outline]) surface.dispose();
			root.removeFromParent();
		},
	};
};
