import { BoxGeometry, BufferGeometry, CircleGeometry, Color, CylinderGeometry, Group, InstancedMesh, LineBasicMaterial, LineSegments, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, RingGeometry, Scene, SphereGeometry, Vector3 } from 'three';
import { ARENA, getEnemyDefense, type State } from './simulation';
import { mechScale } from './gait';
import { createEnvironment } from './environment-3d';

interface PooledObject { root: Object3D; dispose?: () => void }

// World presentation owns its meshes and GPU assets. Simulation objects never
// retain Three.js objects; pools shrink with live state, including on restart.
export const createWorldObjects = function (scene: Scene) {
	const root = new Group(); root.name = 'iron-wake-world'; scene.add(root);
	const environment = createEnvironment(); root.add(environment.root);
	const geometries = new Set<BufferGeometry>(); const materials = new Set<Material>();
	const geometry = function <T extends BufferGeometry>(value: T): T { geometries.add(value); return value; };
	const material = function <T extends Material>(value: T): T { materials.add(value); return value; };
	const solid = function (color: string) { return material(new MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.1 })); };
	const glow = function (color: string, opacity = 1) { return material(new MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity === 1 })); };
	const cube = geometry(new BoxGeometry(1, 1, 1)); const circle = geometry(new CircleGeometry(1, 48));
	const ring = geometry(new RingGeometry(0.98, 1, 64)); const sphere = geometry(new SphereGeometry(1, 8, 6));
	const cylinder = geometry(new CylinderGeometry(1, 1, 1, 8));
	const steel = solid('#667677'); const dark = solid('#293b42'); const cyan = glow('#a3ede3');
	const brass = solid('#a78a53'); const ivory = solid('#b9baa6');
	const repair = glow('#82dfbb'); const coolant = glow('#8bdcec'); const shadow = glow('#050d14', 0.3);
	const repairHaloMaterial = glow('#74cfb7', 0.25); const coolantHaloMaterial = glow('#75cce5', 0.25);
	const group = function (name: string) { const value = new Group(); value.name = name; root.add(value); return value; };
	const box = function (parent: Group, surface: Material, x: number, y: number, z: number, length: number, breadth: number, height: number) {
		const value = new Mesh(cube, surface); value.position.set(x, y + height / 2, z); value.scale.set(length, height, breadth); value.castShadow = true; value.receiveShadow = true; parent.add(value); return value;
	};
	const disc = function (parent: Group, surface: Material, radius: number, outline = false) {
		const value = new Mesh(outline ? ring : circle, surface); value.rotation.x = -Math.PI / 2;
		value.scale.setScalar(radius); parent.add(value); return value;
	};
	const scratch = new Object3D(); const tint = new Color();
	// The flat decorative apron keeps its recorded colors without evaluating a
	// physical lighting shader across the whole viewport on software GPUs.
	const floor = new InstancedMesh(cube, glow('#ffffff'), ARENA.width / 120 * (ARENA.height / 120));
	floor.name = 'industrial-apron'; root.add(floor);
	let tile = 0;
	for (let x = 0; x < ARENA.width; x += 120) for (let z = 0; z < ARENA.height; z += 120) {
		scratch.position.set(x + 60, -0.55, z + 60); scratch.scale.set(119.6, 1, 119.6); scratch.updateMatrix();
		floor.setMatrixAt(tile, scratch.matrix); floor.setColorAt(tile++, tint.set((x / 120 + z / 120) % 3 === 0 ? '#354046' : '#303c41'));
	}
	const stains = new InstancedMesh(circle, glow('#202c32', 0.15), 90); stains.name = 'terrain-marks'; root.add(stains);
	scratch.rotation.x = -Math.PI / 2;
	for (let i = 0; i < 90; i++) {
		scratch.position.set((i * 317 + 71) % ARENA.width, 0.015, (i * 173 + 80) % ARENA.height);
		scratch.scale.setScalar(4 + i % 12); scratch.updateMatrix(); stains.setMatrixAt(i, scratch.matrix);
	}
	const lines: Vector3[] = [];
	for (let x = 0; x <= ARENA.width; x += 120) lines.push(new Vector3(x, 0.025, 0), new Vector3(x, 0.025, ARENA.height));
	for (let z = 0; z <= ARENA.height; z += 120) lines.push(new Vector3(0, 0.025, z), new Vector3(ARENA.width, 0.025, z));
	for (let i = 0; i < 90; i += 3) {
		const x = (i * 317 + 71) % ARENA.width; const z = (i * 173 + 80) % ARENA.height;
		lines.push(new Vector3(x, 0.03, z), new Vector3(x + 24, 0.03, z + 10));
	}
	root.add(new LineSegments(geometry(new BufferGeometry().setFromPoints(lines)), material(new LineBasicMaterial({ color: '#405056', transparent: true, opacity: 0.09, depthWrite: false }))));
	const stripes = group('boundary-stripes'); const stripeMaterial = glow('#b49a60');
	for (let x = 50; x < ARENA.width; x += 110) for (const z of [25, ARENA.height - 25]) box(stripes, stripeMaterial, x + 19, 0.04, z, 38, 5, 0.04);
	const relay = group('relay'); relay.position.set(ARENA.relayX, 0, ARENA.relayY);
	disc(relay, shadow, 97).position.y = 0.04;
	disc(relay, glow('#7da9a2'), 155, true).position.y = 0.08;
	const foundation = new Mesh(cylinder, dark); foundation.scale.set(62, 13, 62); foundation.position.y = 6.5; foundation.rotation.y = Math.PI / 8; relay.add(foundation);
	box(relay, steel, 0, 13, 0, 66, 66, 22); box(relay, dark, 0, 35, 0, 29, 29, 87);
	for (const x of [-47, 47]) {
		box(relay, steel, x, 13, 0, 20, 55, 32); box(relay, brass, x, 45, 0, 21, 56, 4);
		for (const z of [-21, -12, -3, 6, 15, 24]) box(relay, dark, x, 49.2, z, 15, 3, 0.8);
		box(relay, cyan, x, 28, 28, 11, 1.5, 3);
	}
	for (const y of [49, 71, 93]) {
		box(relay, steel, 0, y, 0, 43, 43, 5);
		box(relay, cyan, 0, y + 5, 0, 33, 33, 7);
	}
	for (const x of [-22, 22]) for (const z of [-22, 22]) box(relay, ivory, x, 35, z, 4, 4, 88);
	box(relay, dark, 0, 123, 0, 50, 50, 8); box(relay, ivory, 0, 131, 0, 28, 28, 9);
	box(relay, brass, 0, 140, 0, 3, 3, 38);
	for (const x of [-20, 20]) {
		box(relay, dark, x, 137, 0, 3, 3, 24); box(relay, ivory, x, 154, 0, 17, 5, 3);
	}
	for (let i = 0; i < 8; i++) {
		const angle = i * Math.PI / 4; const x = Math.cos(angle) * 147; const z = Math.sin(angle) * 147;
		box(relay, dark, x, 0.1, z, 14, 8, 2); box(relay, cyan, x, 2.2, z, 9, 4, 0.8);
	}
	const beaconSurface = glow('#c4ffed'); const beacon = new Mesh(sphere, beaconSurface); beacon.position.y = 180; beacon.scale.setScalar(4); relay.add(beacon);
	// Consolidate the manufactured relay parts while retaining the separate
	// beacon and rings. A detailed tower costs six draws rather than sixty.
	const relayBatches: InstancedMesh[] = [];
	for (const surface of [steel, dark, brass, ivory, cyan]) {
		const parts = relay.children.filter(function (child): child is Mesh { return child instanceof Mesh && child.geometry === cube && child.material === surface; });
		const batch = new InstancedMesh(cube, surface, parts.length);
		parts.forEach(function (part, index) { part.updateMatrix(); batch.setMatrixAt(index, part.matrix); relay.remove(part); });
		batch.castShadow = true; batch.receiveShadow = true; relay.add(batch); relayBatches.push(batch);
	}
	const wrecks: PooledObject[] = []; const salvages: ReturnType<typeof createSalvage>[] = [];
	const warnings: PooledObject[] = []; const shots: ReturnType<typeof createShot>[] = []; const effects: ReturnType<typeof createEffect>[] = [];
	const strikes: ReturnType<typeof createStrike>[] = [];
	const defenses: ReturnType<typeof createDefense>[] = [];
	const shadows: PooledObject[] = [];
	const sync = function <T extends PooledObject>(pool: T[], count: number, create: () => T, update: (value: T, index: number) => void) {
		while (pool.length > count) { const value = pool.pop(); value?.root.removeFromParent(); value?.dispose?.(); }
		while (pool.length < count) { const value = create(); root.add(value.root); pool.push(value); }
		pool.forEach(update);
	};
	const createSalvage = function () {
		const value = new Group(); value.name = 'salvage';
		const repairBox = box(value, repair, 0, 5, 0, 17, 17, 12); const coolantBox = box(value, coolant, 0, 5, 0, 17, 17, 12);
		const repairHalo = disc(value, repairHaloMaterial, 27); const coolantHalo = disc(value, coolantHaloMaterial, 27);
		repairHalo.position.y = 0.06; coolantHalo.position.y = 0.06;
		return { root: value, repairBox, coolantBox, repairHalo, coolantHalo };
	};
	const armorArc = geometry(new RingGeometry(0.9, 1, 32, 1, -Math.PI / 3, Math.PI * 2 / 3));
	const armorSurface = glow('#eec58b', 0.8); const exposedSurface = glow('#a2f0d2', 0.9);
	const committedSurface = glow('#ff8f61', 0.8);
	const createDefense = function () {
		const value = new Group(); value.name = 'siege-defense';
		const shield = new Mesh(armorArc, armorSurface); shield.rotation.x = -Math.PI / 2; shield.position.y = 0.3;
		const exposed = disc(value, exposedSurface, 1, true); exposed.position.y = 0.32;
		const commitment = disc(value, committedSurface, 1, true); commitment.position.y = 0.34;
		value.add(shield);
		return { root: value, shield, exposed, commitment };
	};
	const enemyTrail = glow('#ff8866'); const playerTrail = glow('#ffd290'); const missileTrail = glow('#d7d6c6', 0.53);
	const createShot = function () {
		const value = new Group(); value.name = 'projectile';
		const trail = new Mesh(cylinder, playerTrail); const head = new Mesh(cube, playerTrail); head.scale.setScalar(4); value.add(trail, head);
		return { root: value, trail, head };
	};
	const normal = new Vector3(1, 1, 1).normalize(); const zAxis = new Vector3(0, 0, 1);
	const effectRight = new Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2); const effectUp = new Vector3(-1, 2, -1).normalize();
	const createEffect = function () {
		const value = new Group(); value.name = 'impact-effect';
		const surface = new MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false });
		const sparkSurface = new MeshBasicMaterial({ color: '#edf3d4', transparent: true, depthWrite: false });
		const halo = new Mesh(ring, surface); halo.quaternion.setFromUnitVectors(zAxis, normal); value.add(halo);
		const sparks = new InstancedMesh(cube, sparkSurface, 12); sparks.frustumCulled = false; value.add(sparks);
		const flash = new Mesh(sphere, surface); value.add(flash);
		return { root: value, halo, sparks, flash, surface, sparkSurface, dispose: function () { sparks.dispose(); surface.dispose(); sparkSurface.dispose(); } };
	};
	const createStrike = function () {
		const value = new Group(); value.name = 'artillery-warning';
		const surface = new MeshBasicMaterial({ color: '#ff793b', transparent: true, opacity: 0.2, depthWrite: false });
		const fill = disc(value, surface, 1); const boundary = disc(value, warningMaterial, 1, true); const countdown = disc(value, warningMaterial, 1, true);
		fill.position.y = 0.14; boundary.position.y = 0.18; countdown.position.y = 0.2;
		for (const axis of [0, Math.PI / 2]) { const cross = box(value, warningMaterial, 0, 0.24, 0, 18, 1.5, 0.02); cross.rotation.y = axis; }
		const shell = new Mesh(sphere, warningMaterial); shell.scale.set(4, 12, 4); value.add(shell);
		return { root: value, fill, boundary, countdown, shell, surface, dispose: function () { surface.dispose(); } };
	};
	const warningMaterial = glow('#f3a16c');
	const beam = group('laser'); const beamGlow = new Mesh(cylinder, glow('#5de9e5', 0.6)); const beamCore = new Mesh(cylinder, glow('#dbffff'));
	const beamImpact = new Mesh(sphere, glow('#b1ffff')); beam.add(beamGlow, beamCore, beamImpact); beamImpact.scale.setScalar(5);
	const smoke = new Mesh(circle, glow('#b3c4cf', 0.27)); smoke.name = 'reactor-vent'; smoke.quaternion.setFromUnitVectors(zAxis, normal); root.add(smoke);
	const from = new Vector3(); const to = new Vector3(); const delta = new Vector3(); const up = new Vector3(0, 1, 0);
	const segment = function (mesh: Mesh, width: number) {
		delta.subVectors(to, from); const length = delta.length();
		mesh.visible = length > 0.0001; if (!mesh.visible) return;
		mesh.position.copy(from).add(to).multiplyScalar(0.5); mesh.scale.set(width, length, width); mesh.quaternion.setFromUnitVectors(up, delta.normalize());
	};
	let disposed = false;
	return {
		update: function (state: State, reducedMotion: boolean) {
			if (disposed) return;
			beaconSurface.color.set(state.relay < 30 ? '#ff865e' : '#b9fff0');
			beacon.scale.setScalar(reducedMotion ? 4 : 4 + Math.sin(state.time * 2.4) * 0.6);
			const siege = state.enemies.filter(function (enemy) { return enemy.kind === 'siege'; });
			sync(defenses, siege.length, createDefense, function (value, index) {
				const enemy = siege[index]; if (!enemy) return;
				const defense = getEnemyDefense(state, enemy); const radius = (enemy.commander ? 67 : 56) * mechScale(enemy.kind);
				value.root.position.set(enemy.x, 0, enemy.y); value.root.rotation.y = -enemy.angle;
				value.shield.scale.setScalar(radius); value.shield.visible = !defense.exposed;
				value.exposed.scale.setScalar(radius); value.exposed.visible = defense.exposed;
				value.commitment.scale.setScalar(radius + 8); value.commitment.visible = enemy.attack?.phase === 'committed';
			});
			sync(wrecks, state.wrecks.length, function () {
				const value = new Group(); value.name = 'wreck'; disc(value, shadow, 40).position.y = 0.04;
				box(value, dark, 0, 0, 0, 32, 29, 8); box(value, steel, -8, 8, 0, 19, 23, 7).rotation.z = -0.2;
				box(value, dark, 24, 0, -19, 24, 7, 5).rotation.y = 0.5; box(value, dark, -21, 0, 22, 17, 10, 4).rotation.y = -0.3;
				return { root: value };
			}, function (value, index) { const wreck = state.wrecks[index]; if (!wreck) return; value.root.position.set(wreck.x, 0, wreck.y); value.root.rotation.y = -wreck.angle; });
			sync(salvages, state.salvage.length, createSalvage, function (value, index) {
				const salvage = state.salvage[index]; if (!salvage) return;
				value.root.position.set(salvage.x, 0, salvage.y); const bob = reducedMotion ? 0 : Math.sin(state.time * 2) * 2;
				value.repairBox.position.y = 11 + bob; value.coolantBox.position.y = 11 + bob;
				value.repairBox.visible = value.repairHalo.visible = salvage.kind === 'repair'; value.coolantBox.visible = value.coolantHalo.visible = salvage.kind === 'coolant';
			});
			sync(warnings, state.warnings.length, function () { const value = new Group(); value.name = 'inbound-warning'; disc(value, warningMaterial, 1, true); return { root: value }; }, function (value, index) {
				const warning = state.warnings[index]; if (!warning) return; value.root.position.set(warning.x, 0.12, warning.y); value.root.scale.setScalar(45 + (reducedMotion ? 0 : Math.sin(state.time * 8) * 5));
			});
			sync(strikes, state.strikes.length, createStrike, function (value, index) {
				const strike = state.strikes[index]; if (!strike) return;
				value.root.position.set(strike.x, 0, strike.y);
				value.fill.scale.setScalar(strike.radius); value.boundary.scale.setScalar(strike.radius);
				value.countdown.scale.setScalar(strike.radius * Math.max(0.03, strike.life / strike.duration));
				value.surface.opacity = 0.12 + (1 - strike.life / strike.duration) * 0.18;
				value.shell.visible = strike.life < 0.7; value.shell.position.y = 20 + strike.life * 600;
			});
			sync(shadows, state.enemies.length + 1, function () { const value = new Group(); value.name = 'mech-shadow'; disc(value, shadow, 35); return { root: value }; }, function (value, index) {
				const unit = index === 0 ? state.player : state.enemies[index - 1]; if (!unit) return;
				value.root.position.set(unit.x, 0.05, unit.y); value.root.scale.setScalar('kind' in unit ? mechScale(unit.kind) : 1);
			});
			sync(shots, state.shots.length, createShot, function (value, index) {
				const shot = state.shots[index]; if (!shot) return; const duration = shot.kind === 'missile' ? 0.12 : 0.04;
				from.set(shot.x - shot.vx * duration, 42, shot.y - shot.vy * duration); to.set(shot.x, 42, shot.y);
				value.trail.material = shot.kind === 'missile' ? missileTrail : shot.kind === 'enemy' ? enemyTrail : playerTrail;
				value.head.material = shot.kind === 'enemy' ? enemyTrail : playerTrail; value.head.position.copy(to); segment(value.trail, shot.kind === 'cannon' ? 2.5 : 1);
			});
			sync(effects, state.effects.length, createEffect, function (value, index) {
				const effect = state.effects[index]; if (!effect) return; const progress = Math.max(0, 1 - effect.life * 2); const radius = Math.max(1, effect.size * progress) / Math.sqrt(1.5);
				value.root.position.set(effect.x, 36, effect.y); value.halo.scale.setScalar(radius);
				value.surface.color.set(effect.color); value.surface.opacity = value.sparkSurface.opacity = Math.min(1, effect.life * 2);
				value.flash.scale.setScalar(Math.max(0.1, effect.size * (1 - progress) * 0.2));
				for (let i = 0; i < value.sparks.count; i++) {
					const angle = i * 2.4 + effect.x;
					scratch.position.copy(effectRight).multiplyScalar(Math.cos(angle) * radius).addScaledVector(effectUp, Math.sin(angle) * radius + progress * 15 / Math.sqrt(1.5));
					scratch.scale.set(2.2, 2.2 + progress * 5, 2.2); scratch.rotation.set(0, 0, -angle); scratch.updateMatrix(); value.sparks.setMatrixAt(i, scratch.matrix);
				}
				value.sparks.instanceMatrix.needsUpdate = true;
			});
			beam.visible = !!state.beam;
			if (state.beam) {
				from.set(state.player.x, 42, state.player.y); to.set(state.beam.x, 42, state.beam.y);
				segment(beamGlow, 4.5); segment(beamCore, 1.25); beamImpact.position.copy(to);
			}
			smoke.visible = state.player.heat > 60;
			if (smoke.visible) {
				smoke.position.set(state.player.x - Math.cos(state.player.angle) * 23, 70 + (reducedMotion ? 0 : state.time * 25 % 24), state.player.y - Math.sin(state.player.angle) * 23);
				smoke.scale.setScalar((6 + state.player.heat / 15) / Math.sqrt(1.5));
			}
		},
		dispose: function () {
			if (disposed) return; disposed = true;
			for (const effect of effects) effect.dispose();
			for (const strike of strikes) strike.dispose();
			for (const batch of relayBatches) batch.dispose();
			environment.dispose();
			floor.dispose(); stains.dispose();
			for (const value of geometries) value.dispose(); for (const value of materials) value.dispose();
			root.removeFromParent(); root.clear();
		},
	};
};
