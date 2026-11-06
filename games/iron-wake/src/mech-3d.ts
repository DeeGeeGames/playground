import { BoxGeometry, BufferGeometry, EdgesGeometry, Float32BufferAttribute, Group, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Sphere, Vector3 } from 'three';
import { getFrame, type FrameId } from './frames';
import { getWeapon, type WeaponMount } from './arsenal';
import { legJoints, mechScale, posedLegRig, STANDARD_LEG_RIG, type WalkerGait } from './gait';
import { FRAME_RIGS } from './frame-rig';
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
	const original = Boolean(kind) || frame === 'warden';
	const rig = original ? STANDARD_LEG_RIG : FRAME_RIGS[frame];
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
	if (original) box(hull, 0, 0, 45, 25, 37, 12, dark);
	else {
		box(hull, rig.hipForward, 0, rig.hipHeight - 4, 22, rig.hipWidth * 2, 10, dark);
		for (const side of [-1, 1]) {
			box(hull, rig.hipForward, side * rig.hipWidth, rig.hipHeight - 6, 16, 9, 14, steel);
			box(hull, rig.hipForward + 2, side * (rig.hipWidth + 5), rig.hipHeight - 3, 10, 2, 7, amber);
		}
	}
	const turret = new Group(); turret.name = 'turret'; root.add(turret);
	const barrels: { part: Mesh | Group; x: number }[] = [];
	const muzzleParts: Mesh[] = []; const muzzles: Vector3[] = [];
	const ventParts: Mesh[] = []; const exhaust = new Vector3();
	let labelHeight = 0;
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
		// Frame hardware stays with the chassis as the four-mount arsenal grows.
		// Large volumes and negative space carry identity before surface details.
		const gun = function (side: number, bottom: number, length: number, breadth: number, x = 12) {
			const assembly = new Group(); assembly.name = 'gun-slide'; turret.add(assembly);
			barrels.push({ part: assembly, x: 0 });
			box(assembly, x - 18, side, bottom - 3, 23, breadth + 8, breadth + 8, steel);
			box(assembly, x, side, bottom, length, breadth, breadth, dark);
			box(assembly, x + length / 2, side, bottom - 2, 8, breadth + 5, breadth + 4, steel);
			muzzleParts.push(box(assembly, x + length / 2 + 4.5, side, bottom, 1.2, breadth - 2, breadth, dark));
			box(assembly, x + length / 2 - 9, side, bottom - 1, 4, breadth + 2, breadth + 2, trim);
			return assembly;
		};
		const rack = function (side: number, bottom: number, breadth: number, rows: number, x = -12) {
			const pod = new Group(); pod.name = 'salvo-pod'; turret.add(pod);
			barrels.push({ part: pod, x: 0 });
			box(pod, x, side, bottom, 30, breadth + 6, rows * 8 + 8, steel);
			box(pod, x - 1, side, bottom + rows * 8 + 8, 31, breadth + 7, 3, amber);
			box(pod, x + 15.5, side, bottom + 3, 1, breadth, rows * 8 + 2, dark);
			for (const offset of [-1, 0, 1]) for (let row = 0; row < rows; row++) {
				box(pod, x + 16.3, side + offset * breadth / 3.4, bottom + 5 + row * 8, 1, 5.2, 5.2, trim);
				const bore = box(pod, x + 17, side + offset * breadth / 3.4, bottom + 6 + row * 8, 1, 3.2, 3.2, dark);
				if (offset === 0 && row === 0) muzzleParts.push(bore);
			}
			const shutter = box(pod, x + 17.8, side, bottom + rows * 8 + 6, 2, breadth + 3, 4, amber);
			shutters.push({ part: shutter, y: shutter.position.y });
			return pod;
		};
		const cockpit = function (x: number, bottom: number, breadth: number, length: number, tall: number) {
			box(turret, x, 0, bottom, length, breadth, tall, steel).name = 'cockpit-shell';
			box(turret, x + length / 2 + 0.6, 0, bottom + tall * 0.52, 1, breadth - 6, 5, glass).name = 'cockpit-visor';
			box(turret, x - 2, 0, bottom + tall, length - 2, breadth + 1, 2, trim);
		};
		const vent = function (x: number, side: number, bottom: number, count: number) {
			for (let i = 0; i < count; i++) {
				const part = box(turret, x, side, bottom + i * 4, 2, 10, 1.5, trim);
				if (i === count - 1) ventParts.push(part);
			}
		};
		if (frame === 'kestrel') {
			// A forward beak over open avian legs, with a counterweight tail.
			box(turret, -8, 0, 55, 23, 19, 10, dark);
			cockpit(15, 64, 20, 43, 12);
			const prow = box(turret, 31, 0, 60, 25, 18, 7, steel); prow.rotation.z = -0.22;
			box(turret, 39, 0, 62, 12, 12, 3, amber);
			box(turret, -22, 0, 61, 24, 15, 11, steel);
			for (const side of [-1, 1]) {
				gun(side * 19, 57, 27, 4, 17);
				box(turret, -10, side * 14, 64, 17, 5, 8, amber);
				const fin = box(turret, -29, side * 10, 70, 16, 2, 12, steel); fin.rotation.z = -0.5;
				vent(-35, side * 5, 62, 2);
			}
		} else if (frame === 'maul') {
			// Humanoid breacher: shoulder/chest, neck/head, hanging upper arms,
			// and low rocket gauntlets. No shoulder missile towers.
			box(turret, -3, 0, 57, 23, 25, 16, dark);
			box(turret, -4, 0, 71, 32, 43, 22, steel);
			for (const side of [-1, 1]) {
				const breast = box(turret, 13, side * 11, 77, 8, 20, 15, steel); breast.rotation.z = -0.17;
				box(turret, 18, side * 11, 79, 2, 15, 4, amber);
				box(turret, -3, side * 33, 83, 27, 20, 16, steel);
				const cap = box(turret, -4, side * 34, 99, 27, 22, 3, trim); cap.rotation.x = side * 0.1;
				const shoulder = box(turret, 10, side * 34, 86, 6, 19, 12, steel); shoulder.rotation.z = -0.25;
				box(turret, 14, side * 34, 90, 2, 10, 3, amber);
				box(turret, -3, side * 38, 63, 12, 12, 24, dark);
				box(turret, -2, side * 40, 65, 16, 9, 16, steel);
				box(turret, 2, side * 40, 59, 17, 16, 9, dark);
				rack(side * 41, 39, 19, 2, 10);
				box(turret, 12, side * 55, 41, 26, 5, 21, steel);
				box(turret, 24, side * 55, 43, 3, 6, 15, amber);
				box(turret, -24, side * 14, 68, 13, 15, 25, dark);
				vent(-31, side * 14, 74, 4);
			}
			box(turret, -2, 0, 93, 14, 14, 7, dark);
			cockpit(1, 100, 18, 20, 13);
			box(turret, 12, 0, 100, 3, 20, 4, amber);
			const brow = box(turret, 8, 0, 114, 13, 21, 3, steel); brow.rotation.z = -0.16;
		} else if (frame === 'longbow') {
			// A tall, narrow humanoid with one long accelerator forearm and a
			// compact cooling pack behind the other shoulder.
			box(turret, -3, 0, 69, 17, 18, 17, dark);
			box(turret, -3, 0, 85, 24, 27, 24, steel);
			const breast = box(turret, 10, 0, 88, 6, 25, 17, steel); breast.rotation.z = -0.15;
			box(turret, 14, 0, 95, 2, 16, 3, amber);
			box(turret, 11, 0, 105, 7, 23, 2, trim);
			box(turret, -2, 0, 109, 10, 11, 4, dark);
			cockpit(0, 113, 15, 19, 13);
			const brow = box(turret, 8, 0, 128, 12, 19, 3, steel); brow.rotation.z = -0.22;
			for (const side of [-1, 1]) {
				const cheek = box(turret, 4, side * 8, 114, 15, 3, 10, steel); cheek.rotation.z = -0.2;
				box(turret, 1, side * 9, 110, 19, 4, 3, dark);
			}
			box(turret, -9, 0, 129, 3, 3, 9, dark);
			box(turret, -9, 0, 136, 11, 4, 3, glass);
			for (const side of [-1, 1]) {
				box(turret, -4, side * 23, 96, 19, 14, 12, steel);
				box(turret, -4, side * 23, 108, 17, 15, 2, trim);
				box(turret, -3, side * 26, 76, 9, 9, 23, dark);
				box(turret, 1, side * 26, 77, 7, 11, 17, steel);
				box(turret, 3, side * 26, 72, 13, 13, 8, dark);
			}
			const accelerator = gun(-27, 68, 83, 8, 25);
			for (const x of [4, 15, 26, 37]) box(accelerator, x, -27, 66, 3, 13, 12, amber);
			box(turret, 3, 27, 57, 16, 14, 20, steel);
			box(turret, 7, 27, 55, 15, 12, 6, dark);
			box(turret, -22, 14, 84, 18, 16, 30, dark);
			for (const side of [9, 15, 22]) box(turret, -23, side, 85, 23, 2, 29, trim);
			box(turret, -23, 15, 114, 24, 17, 3, amber);
			vent(-16, -6, 90, 4);
		} else {
			// Armless carrier. Tall outboard silos surround a low bridge and a
			// deliberately empty central notch, above crouched loadbearing legs.
			box(turret, -10, 0, 44, 34, 42, 12, dark);
			cockpit(17, 49, 24, 35, 15);
			box(turret, 30, 0, 45, 13, 28, 5, amber);
			for (const side of [-1, 1]) {
				box(turret, -13, side * 24, 50, 22, 14, 16, steel);
				rack(side * 36, 65, 22, 4, -17);
				box(turret, -31, side * 36, 55, 10, 26, 13, dark);
				const brace = box(turret, -25, side * 30, 49, 10, 8, 24, steel); brace.rotation.x = side * -0.35;
				box(turret, -34, side * 36, 69, 4, 18, 26, trim);
				box(turret, -18, side * 52, 74, 20, 3, 19, steel);
				vent(-28, side * 12, 48, 3);
			}
			box(turret, -30, -47, 97, 2, 2, 18, dark);
			box(turret, -30, -47, 114, 3, 3, 2, glass);
		}
	}

	// Rock the upper assembly about the waist, keeping the planted-leg rig intact.
	const waistHeight = rig.hipHeight * size;
	for (const part of turret.children) part.position.y -= waistHeight - (rig.torsoRise ?? 0) * size;
	turret.rotation.order = 'YXZ';
	const legs = [0, 1].map(function () {
		const foot = new Group(); foot.name = 'planted-foot'; root.add(foot);
		if (original) {
			box(foot, 0, 0, 0, 38, 18, 7, dark);
			for (const side of [-1, 1]) box(foot, 15, side * 6, 0, 15, 6, 5, steel);
		} else if (frame === 'kestrel') {
			box(foot, -5, 0, 0, 18, 10, 6, dark);
			for (const side of [-1, 1]) {
				const toe = box(foot, 11, side * 6, 0, 23, 4, 4, steel); toe.rotation.y = side * -0.15;
				box(foot, 20, side * 8, 0, 7, 4, 3, trim);
			}
			box(foot, -18, 0, 0, 15, 5, 4, steel);
		} else {
			const broad = frame === 'maul' ? 23 : frame === 'morrow' ? 26 : 14;
			box(foot, 0, 0, 0, 33, broad, 7, dark);
			box(foot, 10, 0, 2, 23, broad + 2, 7, steel);
			box(foot, 21, 0, 1, 5, broad, 4, trim);
			box(foot, -12, 0, 1, 9, broad + 2, 5, steel);
			if (frame === 'morrow') for (const side of [-1, 1]) box(foot, 4, side * 15, 0, 25, 5, 4, steel);
		}
		return {
			foot, upper: box(root, 0, 0, 0, 1, 1, 1, dark), lower: box(root, 0, 0, 0, 1, 1, 1, steel),
			piston: box(root, 0, 0, 0, 1, 1, 1, steel),
			knee: box(root, 0, 0, 0, original ? 14 : frame === 'kestrel' ? 9 : 14, original ? 17 : frame === 'kestrel' ? 12 : 18, 9, dark),
			ankle: box(root, 0, 0, 0, 13, original ? 14 : frame === 'kestrel' ? 10 : 14, 9, steel),
			guard: original ? undefined : box(root, 0, 0, 0, 1, 1, 1, steel),
			thigh: !kind && (frame === 'maul' || frame === 'longbow') ? box(root, 0, 0, 0, 1, 1, 1, steel) : undefined,
		};
	});
	const up = new Vector3(0, 1, 0); const start = new Vector3(); const end = new Vector3(); const direction = new Vector3();
	const plateForward = new Vector3(); const plateSide = new Vector3(); const plateBasis = new Matrix4();
	const armorPlate = function (part: Mesh, angle: number, width: number, height: number, offset: number) {
		direction.subVectors(end, start).normalize();
		plateForward.set(Math.cos(angle), 0, Math.sin(angle));
		plateForward.addScaledVector(direction, -plateForward.dot(direction)).normalize();
		plateSide.crossVectors(plateForward, direction).normalize();
		plateBasis.makeBasis(plateForward, direction, plateSide);
		part.quaternion.setFromRotationMatrix(plateBasis);
		part.position.copy(start).lerp(end, 0.38).addScaledVector(plateForward, offset * size);
		// X is fore/aft thickness; Z spans across the leg. The explicit basis
		// keeps asymmetric armor facing forward through hull turns and strides.
		part.scale.set(5 * size, height * size, width * size);
	};
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
	for (const part of muzzleParts) { part.name = 'weapon-muzzle'; muzzles.push(new Vector3()); }
	return {
		root,
		// Root-local anchors include aim, pelvis motion, and weapon recoil.
		// The presentation adds the current simulation position after posing;
		// ECS has not yet synchronized the root's transform at this point.
		get muzzles(): readonly Vector3[] { return muzzles; },
		get exhaust(): Vector3 | undefined { return ventParts.length > 0 ? exhaust : undefined; },
		get labelHeight(): number { return labelHeight; },
		pose: function (gait: WalkerGait, heading: number, feedback?: MechFeedback) {
			hull.rotation.y = -gait.body.angle; turret.rotation.y = -heading;
			const poseRig = posedLegRig(gait, size, rig);
			const humanoid = rig.kneeDirection === 1;
			hull.position.y = (poseRig.hipHeight - rig.hipHeight) * size;
			const motion = feedback?.reducedMotion ? 0 : 1;
			// Tall humanoids stabilize their upper assembly over the pelvis.
			// Keep a small support-side shift and lean without magnifying the
			// shared suspension roll through their much longer waist-to-head lever.
			const roll = gait.motion.roll * (humanoid ? 0.28 : 1);
			const pitch = gait.motion.pitch * (humanoid ? 0.5 : 1);
			const sway = gait.motion.roll * (humanoid ? 6 : 26) * size * motion * suspension;
			turret.position.set(-Math.sin(gait.body.angle) * sway, humanoid ? poseRig.hipHeight * size : waistHeight + gait.motion.lift * size * motion * suspension, Math.cos(gait.body.angle) * sway);
			// Express chassis-relative lean in turret space so aiming does not
			// rotate the weight shift away from the supporting foot.
			const relativeHeading = gait.body.angle - heading;
			turret.rotation.x = (Math.cos(relativeHeading) * roll - Math.sin(relativeHeading) * pitch) * motion * suspension;
			turret.rotation.z = (Math.sin(relativeHeading) * roll + Math.cos(relativeHeading) * pitch) * motion * suspension;
			const recoil = feedback?.reducedMotion ? 0 : feedback?.recoil ?? 0;
			for (const barrel of barrels) barrel.part.position.x = barrel.x - recoil * 7 * size * (kind ? 1 : definition.recoil);
			for (const shutter of shutters) shutter.part.position.y = shutter.y + recoil * 5 * size;
			const hit = feedback?.hit ?? 0;
			for (const surface of [steel, amber, trim]) { surface.emissive.set('#ffae73'); surface.emissiveIntensity = hit * 0.8; }
			glass.emissiveIntensity = 0.6 + (feedback?.heat ?? 0) / 170;
			for (const [index, leg] of legs.entries()) {
				const side = index === 0 ? 0 : 1; const foot = gait.feet[side];
				const { hip, knee, ankle } = legJoints(gait.body, foot, side, size, poseRig);
				const x = gait.body.x; const y = gait.body.y;
				leg.foot.position.set(foot.x - x, foot.lift, foot.y - y); leg.foot.rotation.y = -foot.angle;
				start.set(hip.x - x, hip.z, hip.y - y); end.set(knee.x - x, knee.z, knee.y - y); link(leg.upper, (original ? 12 : frame === 'kestrel' ? 7 : frame === 'maul' ? 17 : frame === 'longbow' ? 10 : 16) * size);
				if (leg.thigh) armorPlate(leg.thigh, gait.body.angle, frame === 'maul' ? 19 : 12, frame === 'maul' ? 20 : 23, frame === 'maul' ? 9 : 6);
				start.copy(end); end.set(ankle.x - x, ankle.z, ankle.y - y); link(leg.lower, (original ? 14 : frame === 'kestrel' ? 8 : frame === 'maul' ? 19 : frame === 'longbow' ? 12 : 18) * size);
				if (leg.guard) {
					armorPlate(leg.guard, gait.body.angle, frame === 'maul' ? 22 : frame === 'morrow' ? 20 : frame === 'longbow' ? 13 : 9, frame === 'kestrel' ? 12 : 21, frame === 'maul' || frame === 'morrow' ? 10 : 7);
				}
				start.set(knee.x - x + Math.cos(gait.body.angle) * 5 * size, knee.z - size, knee.y - y + Math.sin(gait.body.angle) * 5 * size);
				end.y += 3 * size; link(leg.piston, 3 * size);
				leg.knee.position.set(knee.x - x, knee.z + 0.5 * size, knee.y - y); leg.knee.rotation.y = -gait.body.angle;
				leg.ankle.position.set(ankle.x - x, ankle.z + 1.5 * size, ankle.y - y); leg.ankle.rotation.y = -foot.angle;
			}
			root.updateMatrixWorld(true); inverseRoot.copy(root.matrixWorld).invert();
			for (const [index, part] of muzzleParts.entries()) muzzles[index]?.set(0.5, 0, 0).applyMatrix4(part.matrixWorld).applyMatrix4(inverseRoot);
			exhaust.set(0, 0, 0);
			for (const part of ventParts) exhaust.add(vertex.set(-0.5, 0, 0).applyMatrix4(part.matrixWorld).applyMatrix4(inverseRoot));
			if (ventParts.length > 0) exhaust.divideScalar(ventParts.length);
			for (const batch of batches) {
				for (const [index, part] of batch.members.entries()) { relative.multiplyMatrices(inverseRoot, part.matrixWorld); batch.mesh.setMatrixAt(index, relative); }
				batch.mesh.instanceMatrix.needsUpdate = true;
			}
			labelHeight = 0;
			for (const [index, part] of edged.entries()) {
				relative.multiplyMatrices(inverseRoot, part.matrixWorld);
				for (let i = 0; i < edgeVertices.count; i++) {
					vertex.fromBufferAttribute(edgeVertices, i).applyMatrix4(relative); outlinePositions.setXYZ(index * edgeVertices.count + i, vertex.x, vertex.y, vertex.z);
					// The fixed isometric view projects rear/outboard armor above
					// its vertical height. Keep labels above the whole silhouette.
					labelHeight = Math.max(labelHeight, vertex.y - (vertex.x + vertex.z) * 0.5);
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
