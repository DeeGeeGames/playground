import { BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three';
import { legJoints, type WalkerGait } from './gait';

export const createMech = function () {
	const root = new Group(); root.name = 'siege-frame';
	const geometry = new BoxGeometry(1, 1, 1);
	const edges = new EdgesGeometry(geometry);
	const portGeometry = new PlaneGeometry(1, 1);
	const material = function (color: string, emissive = '#000000') {
		return new MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.25, roughness: 0.85, metalness: 0.15 });
	};
	const steel = material('#546879'); const dark = material('#263744'); const amber = material('#c79555');
	const glass = material('#9fe5e7', '#9fe5e7'); const port = material('#101c26');
	const outline = new LineBasicMaterial({ color: '#7d91a0', transparent: true, opacity: 0.55 });
	const box = function (parent: Group, x: number, side: number, bottom: number, length: number, breadth: number, height: number, surface: MeshStandardMaterial) {
		const mesh = new Mesh(geometry, surface);
		mesh.position.set(x, bottom + height / 2, side); mesh.scale.set(length, height, breadth);
		mesh.add(new LineSegments(edges, outline)); parent.add(mesh); return mesh;
	};
	const hull = new Group(); hull.name = 'hull'; root.add(hull);
	box(hull, 0, 0, 45, 25, 37, 12, dark);
	const turret = new Group(); turret.name = 'turret'; root.add(turret);
	box(turret, -5, 0, 54, 35, 41, 20, steel);
	box(turret, 17, 0, 53, 34, 27, 16, steel);
	box(turret, 29, 0, 64, 10, 23, 6, glass);
	for (const side of [-1, 1]) {
		box(turret, -7, side * 33, 49, 26, 18, 16, steel);
		box(turret, 15, side * 33, 51, 35, 8, 8, dark);
		box(turret, -11, side * 33, 70, 22, 23, 19, amber);
		for (const offset of [-7, 0, 7]) for (const z of [75, 82]) {
			// Front-facing surface details sit just outside the rack. FrontSide
			// culling and the shared depth buffer handle every turret heading.
			const detail = new Mesh(portGeometry, port); detail.name = 'missile-port';
			detail.rotation.y = Math.PI / 2; detail.scale.set(4, 4, 1);
			detail.position.set(0.035, z + 2, side * 33 + offset); turret.add(detail);
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
				const { hip, knee, ankle } = legJoints(gait.body, foot, side);
				const x = gait.body.x; const y = gait.body.y;
				leg.foot.position.set(foot.x - x, foot.lift, foot.y - y); leg.foot.rotation.y = -foot.angle;
				start.set(hip.x - x, hip.z, hip.y - y); end.set(knee.x - x, knee.z, knee.y - y); link(leg.upper, 12);
				start.copy(end); end.set(ankle.x - x, ankle.z, ankle.y - y); link(leg.lower, 14);
				start.set(knee.x - x + Math.cos(gait.body.angle) * 5, knee.z - 1, knee.y - y + Math.sin(gait.body.angle) * 5);
				end.y += 3; link(leg.piston, 3);
				leg.knee.position.set(knee.x - x, knee.z + 0.5, knee.y - y); leg.knee.rotation.y = -gait.body.angle;
				leg.ankle.position.set(ankle.x - x, ankle.z + 1.5, ankle.y - y); leg.ankle.rotation.y = -foot.angle;
			}
		},
		dispose: function () {
			if (disposed) return; disposed = true;
			geometry.dispose(); edges.dispose(); portGeometry.dispose();
			for (const surface of [steel, dark, amber, glass, port, outline]) surface.dispose();
			root.removeFromParent();
		},
	};
};
