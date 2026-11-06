import { BoxGeometry, BufferGeometry, EdgesGeometry, Float32BufferAttribute, Group, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Sphere, Vector3 } from 'three';
import { getFrame, type FrameId } from './frames';
import { getWeapon, type WeaponMount } from './arsenal';
import { legJoints, mechScale, type WalkerGait } from './gait';
import type { EnemyKind } from './simulation';

export interface MechFeedback { recoil: number; hit: number; heat: number; time: number; reducedMotion: boolean }

// Recover the shot envelope from simulation-owned cooldowns, so firing freezes
// with combat and works for every equipped family, including later draft mounts.
export const weaponRecoil = function (loadout: readonly WeaponMount[]): number {
	return loadout.reduce(function (largest, mount) {
		const weapon = getWeapon(mount.weapon);
		if (weapon.kind === 'laser') return Math.max(largest, mount.firing ? 0.12 : 0);
		const duration = Math.min(0.22, weapon.interval * 0.8);
		const impulse = Math.max(0, (mount.cooldown - weapon.interval + duration) / duration);
		const weight = weapon.kind === 'bullet' ? 0.35 : weapon.kind === 'missile' ? 0.65 : 1;
		return Math.max(largest, Math.min(1, impulse) * weight);
	}, 0);
};

export const createMech = function (kind?: EnemyKind, commander = false, frame: FrameId = 'warden') {
	const definition = getFrame(frame);
	const size = kind ? mechScale(kind) : definition.size;
	const suspension = kind ? 1 : definition.suspension;
	const colors = { scout: '#9c6f4e', striker: '#8d5350', siege: '#6b5f60' };
	const root = new Group(); root.name = kind ? 'siege-frame' : `${frame}-frame`;
	const parts: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];
	const geometry = new BoxGeometry(1, 1, 1);
	const edges = new EdgesGeometry(geometry);
	const portGeometry = new PlaneGeometry(1, 1);
	const material = function (color: string, emissive = '#000000') {
		return new MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.45, roughness: 0.66, metalness: 0.32 });
	};
	const steel = material(commander ? '#772f2d' : kind ? colors[kind] : frame === 'kestrel' ? '#597a73' : frame === 'maul' ? '#896650' : frame === 'longbow' ? '#6b6b89' : frame === 'morrow' ? '#6a7961' : '#738986'); const dark = material('#253239'); const amber = material(commander ? '#bdb6a0' : kind ? '#aa7454' : definition.color);
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
	const barrels: { part: Mesh | Group; x: number }[] = [];
	const shutters: { part: Mesh; y: number }[] = [];
	if (kind || frame === 'warden') {
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
	} else {
		// Each player variant has an authored silhouette around the same fully
		// articulated hip rig. These are frame hardware, not fixed loadout slots.
		const gun = function (side: number, height: number, length: number, breadth: number) {
			box(turret, -8, side, height - 4, 24, breadth + 10, 16, steel);
			for (const [x, width, depth, tall, surface] of [
				[12, length, breadth, breadth, dark],
				[12 + length / 2, 7, breadth + 4, breadth + 4, steel],
				[16 + length / 2, 1, breadth - 2, breadth - 2, dark],
			] as const) {
				const part = box(turret, x, side, height, width, depth, tall, surface);
				barrels.push({ part, x: part.position.x });
			}
		};
		const rack = function (side: number, bottom: number, breadth: number, rows: number) {
			const pod = new Group(); pod.name = 'salvo-pod'; turret.add(pod);
			barrels.push({ part: pod, x: 0 });
			box(pod, -12, side, bottom, 34, breadth + 6, rows * 8 + 8, steel);
			box(pod, -14, side, bottom + rows * 8 + 8, 36, breadth + 8, 3, amber);
			box(pod, 5.4, side, bottom + 3, 1, breadth, rows * 8 + 2, dark);
			for (const offset of [-1, 0, 1]) for (let row = 0; row < rows; row++) {
				box(pod, 6.2, side + offset * breadth / 3.4, bottom + 5 + row * 8, 1, 5.2, 5.2, trim);
				box(pod, 6.8, side + offset * breadth / 3.4, bottom + 6 + row * 8, 1, 3.2, 3.2, dark);
			}
			const shutter = box(pod, 7.5, side, bottom + rows * 8 + 6, 2, breadth + 3, 4, amber);
			shutters.push({ part: shutter, y: shutter.position.y });
		};
		const cockpit = function (x: number, bottom: number, breadth: number, length: number, tall: number) {
			box(turret, x, 0, bottom, length, breadth, tall, steel).name = 'cockpit-shell';
			box(turret, x + length / 2 + 0.4, 0, bottom + tall * 0.52, 1, breadth - 6, 6, glass).name = 'cockpit-visor';
			box(turret, x, 0, bottom + tall, length + 2, breadth + 2, 3, trim);
		};
		if (frame === 'kestrel') {
			// Low dart-like cabin, exposed shoulder pivots and compact tracer guns.
			cockpit(8, 56, 26, 50, 15);
			box(turret, -18, 0, 52, 20, 25, 18, dark);
			for (const side of [-1, 1]) {
				gun(side * 24, 48, 28, 5);
				box(turret, 10, side * 24, 55, 25, 11, 2, amber);
				const fin = box(turret, -20, side * 17, 65, 21, 3, 19, steel); fin.rotation.z = -0.28;
				box(turret, -25, side * 8, 52, 5, 6, 12, trim);
				box(hull, 3, side * 23, 38, 20, 5, 13, steel);
			}
			box(turret, -17, -17, 82, 2, 2, 13, dark);
		} else if (frame === 'maul') {
			// A low armored slab with hanging cheek guards and forward rocket banks.
			cockpit(16, 53, 34, 32, 20);
			box(turret, -15, 0, 50, 35, 48, 25, steel);
			for (const side of [-1, 1]) {
				rack(side * 38, 58, 23, 2);
				const shield = box(turret, 17, side * 47, 36, 29, 8, 34, steel); shield.rotation.z = -0.18;
				box(turret, 32, side * 47, 41, 3, 9, 22, amber);
				box(hull, 4, side * 25, 32, 31, 13, 16, steel);
				box(turret, -31, side * 13, 55, 5, 10, 22, dark);
			}
			box(turret, 26, 0, 47, 18, 37, 8, dark);
			box(turret, 32, 0, 49, 7, 35, 4, amber);
		} else if (frame === 'longbow') {
			// Tall sensor cabin; one long particle accelerator and a separate
			// exposed radiator bank give the gunner an asymmetric profile.
			cockpit(2, 65, 27, 29, 28);
			box(turret, -8, 0, 49, 31, 35, 18, dark);
			gun(-31, 60, 76, 9);
			for (const x of [-2, 8, 18, 28]) box(turret, x, -31, 58, 3, 15, 15, amber);
			box(turret, -8, 30, 53, 28, 19, 21, dark);
			for (const x of [-20, -13, -6, 1, 8]) box(turret, x, 30, 52, 3, 27, 32, trim);
			box(turret, -14, 0, 92, 3, 3, 20, dark);
			box(turret, -14, 0, 111, 17, 5, 4, glass);
			for (const side of [-1, 1]) box(hull, 0, side * 23, 38, 27, 7, 16, steel);
		} else {
			// A recessed narrow bridge between tall separated missile towers.
			cockpit(14, 53, 27, 34, 20);
			box(turret, -18, 0, 48, 25, 32, 26, dark);
			for (const side of [-1, 1]) {
				rack(side * 34, 64, 24, 4);
				box(turret, -27, side * 34, 54, 10, 26, 15, dark);
				box(turret, -30, side * 34, 72, 4, 18, 26, trim);
				box(hull, 1, side * 23, 36, 27, 9, 17, steel);
			}
			box(turret, -18, 0, 78, 4, 4, 33, dark);
			box(turret, -18, 0, 108, 19, 7, 5, amber);
		}
		// Radiator louvers and chassis bracing remain visible at every heading.
		for (const side of [-1, 1]) for (let vent = 0; vent < 4; vent++) {
			box(turret, -32, side * 10, 52 + vent * 4, 2, 7, 2, trim);
		}
	}

	// Rock the upper assembly about the waist, keeping the planted-leg rig intact.
	const waistHeight = 48 * size;
	for (const part of turret.children) part.position.y -= waistHeight;
	turret.rotation.order = 'YXZ';
	const legs = [0, 1].map(function () {
		const foot = new Group(); root.add(foot);
		box(foot, 0, 0, 0, frame === 'kestrel' && !kind ? 33 : 38, frame === 'maul' && !kind ? 23 : 18, 7, dark);
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
			const motion = feedback?.reducedMotion ? 0 : 1;
			const sway = gait.motion.roll * 26 * size * motion * suspension;
			turret.position.set(-Math.sin(gait.body.angle) * sway, waistHeight + gait.motion.lift * size * motion * suspension, Math.cos(gait.body.angle) * sway);
			// Express chassis-relative lean in turret space so aiming does not
			// rotate the weight shift away from the supporting foot.
			const relativeHeading = gait.body.angle - heading;
			turret.rotation.x = (Math.cos(relativeHeading) * gait.motion.roll - Math.sin(relativeHeading) * gait.motion.pitch) * motion * suspension;
			turret.rotation.z = (Math.sin(relativeHeading) * gait.motion.roll + Math.cos(relativeHeading) * gait.motion.pitch) * motion * suspension;
			const recoil = feedback?.reducedMotion ? 0 : feedback?.recoil ?? 0;
			for (const barrel of barrels) barrel.part.position.x = barrel.x - recoil * 7 * size * (kind ? 1 : definition.recoil);
			for (const shutter of shutters) shutter.part.position.y = shutter.y + recoil * 5 * size;
			const hit = feedback?.hit ?? 0;
			for (const surface of [steel, amber, trim]) { surface.emissive.set('#ffae73'); surface.emissiveIntensity = hit * 0.8; }
			glass.emissiveIntensity = 0.6 + (feedback?.heat ?? 0) / 170;
			for (const [index, leg] of legs.entries()) {
				const side = index === 0 ? 0 : 1; const foot = gait.feet[side];
				const { hip, knee, ankle } = legJoints(gait.body, foot, side, size);
				const x = gait.body.x; const y = gait.body.y;
				leg.foot.position.set(foot.x - x, foot.lift, foot.y - y); leg.foot.rotation.y = -foot.angle;
				start.set(hip.x - x, hip.z, hip.y - y); end.set(knee.x - x, knee.z, knee.y - y); link(leg.upper, (frame === 'kestrel' && !kind ? 9 : 12) * size);
				start.copy(end); end.set(ankle.x - x, ankle.z, ankle.y - y); link(leg.lower, (frame === 'kestrel' && !kind ? 11 : frame === 'maul' && !kind ? 18 : 14) * size);
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
