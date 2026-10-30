import { ACESFilmicToneMapping, AdditiveBlending, BufferAttribute, BufferGeometry, Color, ConeGeometry, DirectionalLight, DoubleSide, Group, HemisphereLight, IcosahedronGeometry, Line, LineBasicMaterial, LineDashedMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, MOUSE, Object3D, PCFSoftShadowMap, Points, PointsMaterial, Raycaster, RingGeometry, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnemy, createEscort, createTurret, disposeObject, type TurretVisual } from './actors-3d';
import { DECK_HEIGHT, edgeIndicator, FLIGHT_HEIGHT, mountHeight, pickEnemy, pickMount, resizeView, toScreen, toWorld, TURRET_HEIGHT, viewFor, type View } from './projection';
import { beaconFor, CRUISE_SPEED, journeyFor } from './journey';
import { createState, coverageFor, ESCORTS, interdictionReason, type Enemy, type Point, type State } from './simulation';
import { SHIELD_CENTER, SHIELD_RADII } from './ship-config';
import { createTrajectory, effectHeight, projectileHeight, type Trajectory } from './projectiles-3d';
import { shieldAppearance } from './shield-view';
import { canAcquire, contactIntel } from './sensors';
import { fieldRelative, INTERDICTION_CONFIG } from './interdiction';

type PickTarget = { kind: 'mount'; index: number } | { kind: 'enemy'; id: number } | { kind: 'hull' };
export interface PickResult { mount: number; enemy: Enemy | undefined; world: Point | undefined }
export interface Presentation {
	render: (state: State, selected: number, reducedMotion: boolean, rallyMode: boolean, controlsEnabled: boolean, placement?: Point) => void;
	pick: (point: Point, state: State) => PickResult;
	placementPoint: (point: Point) => Point | undefined;
	resetCamera: () => void;
	cancelInteraction: () => void;
	getView: () => View;
	dispose: () => void;
}

const circle = function (color: string, radius = 1, opacity = 1, width = 0.008): Mesh {
	const mesh = new Mesh(new RingGeometry(radius, radius + width, 96), new MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false, side: DoubleSide }));
	mesh.rotation.x = -Math.PI / 2;
	return mesh;
};

const visible = function (object: Object3D): boolean {
	let current: Object3D | null = object;
	while (current) { if (!current.visible) return false; current = current.parent; }
	return true;
};

export const createPresentation = async function (canvas: HTMLCanvasElement): Promise<Presentation> {
	const scene = new Scene();
	const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
	renderer.setClearColor('#080f19');
	renderer.outputColorSpace = SRGBColorSpace;
	renderer.toneMapping = ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.15;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = PCFSoftShadowMap;
	let view = viewFor(1, 1);
	const controls = new OrbitControls(view.camera, canvas);
	controls.enablePan = false;
	controls.enableDamping = false;
	controls.minPolarAngle = Math.PI / 8;
	controls.maxPolarAngle = Math.PI / 2 - 0.35;
	controls.minZoom = 0.65;
	controls.maxZoom = 2;
	controls.mouseButtons.LEFT = undefined;
	controls.mouseButtons.MIDDLE = MOUSE.DOLLY;
	controls.mouseButtons.RIGHT = MOUSE.ROTATE;
	controls.saveState();
	const overlay = document.createElement('canvas');
	overlay.className = 'tactical-labels';
	overlay.setAttribute('aria-hidden', 'true');
	const ctx = overlay.getContext('2d');
	if (!ctx) { controls.dispose(); renderer.dispose(); throw new Error('Tactical labels unavailable'); }
	canvas.parentElement?.append(overlay);
	let disposed = false;
	let labelsDirty = true;
	let mountVisibility: readonly boolean[] = [];
	let mountSignature = '';
	const markLabelsDirty = function () { labelsDirty = true; };
	controls.addEventListener('change', markLabelsDirty);
	const raycaster = new Raycaster();
	const targets = new Map<Object3D, PickTarget>();
	const enemyModels = new Map<number, Group>();
	const escortModels = new Map<number, Group>();
	const trajectories = new Map<number, Trajectory>();
	const abort = new AbortController();
	canvas.addEventListener('webglcontextlost', function (event) { event.preventDefault(); }, { signal: abort.signal });
	const cleanup = function () {
		if (disposed) return;
		disposed = true;
		abort.abort();
		controls.removeEventListener('change', markLabelsDirty);
		controls.dispose();
		trajectories.clear();
		scene.traverse(function (object) { if (object instanceof DirectionalLight) object.shadow.dispose(); });
		disposeObject(scene);
		scene.clear();
		renderer.dispose();
		renderer.forceContextLoss();
		overlay.remove();
	};
	let ark: Group;
	try {
		const model = await new GLTFLoader().loadAsync(new URL('./models/gateward-ark.glb', document.baseURI).href);
		ark = model.scene;
		scene.add(ark);
		ark.updateMatrixWorld(true);
		const mounts = createState().mounts;
		for (const [index, mount] of mounts.entries()) {
			const anchor = ark.getObjectByName(`Mount_${String(index + 1).padStart(2, '0')}`);
			if (!anchor || anchor.getWorldPosition(new Vector3()).distanceTo(new Vector3(mount.x, DECK_HEIGHT, mount.y)) > 0.05)
				throw new Error(`Invalid ship hardpoint ${index + 1}`);
			targets.set(anchor, { kind: 'mount', index });
		}
		ark.traverse(function (object) { if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; } });
		targets.set(ark, { kind: 'hull' });
	} catch (error: unknown) { cleanup(); throw error; }

	const light = new DirectionalLight('#f6f0e4', 3.2);
	light.position.set(-240, 540, 320);
	light.castShadow = true;
	light.shadow.mapSize.set(1024, 1024);
	light.shadow.camera.left = -450; light.shadow.camera.right = 450;
	light.shadow.camera.top = 350; light.shadow.camera.bottom = -350;
	light.shadow.camera.near = 1; light.shadow.camera.far = 1600;
	light.shadow.bias = -0.0003;
	light.shadow.normalBias = 0.3;
	scene.add(light, new HemisphereLight('#b8cede', '#192231', 2));
	const fill = new DirectionalLight('#7295b3', 1.2);
	fill.position.set(250, 100, -400); scene.add(fill);
	const turrets: readonly TurretVisual[] = createState().mounts.map(function (mount, index) {
		const turret = createTurret(mount);
		scene.add(turret.root); targets.set(turret.root, { kind: 'mount', index }); return turret;
	});
	const drives = [1, 2, 3, 4].map(function (index) { return ark.getObjectByName(`Drive_${String(index).padStart(2, '0')}`); });
	const plumes = drives.flatMap(function (drive) {
		if (!drive) return [];
		const plume = new Mesh(new ConeGeometry(11, 1, 12, 1, true), new MeshBasicMaterial({ color: '#9ed8e0', transparent: true, opacity: 0.24, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
		plume.rotation.z = Math.PI / 2; scene.add(plume);
		return [{ plume, origin: drive.getWorldPosition(new Vector3()) }];
	});
	const shield = new Mesh(new SphereGeometry(1, 40, 24), new MeshBasicMaterial({ color: '#88f1e4', transparent: true, opacity: 0.065, depthWrite: false, blending: AdditiveBlending }));
	shield.scale.set(SHIELD_RADII.x, SHIELD_RADII.y, SHIELD_RADII.z); shield.position.set(SHIELD_CENTER.x, SHIELD_CENTER.y, SHIELD_CENTER.z); shield.visible = false; scene.add(shield);
	const energyShield = new Mesh(new SphereGeometry(1, 40, 24), new MeshBasicMaterial({ color: '#75bfe8', transparent: true, opacity: 0.012, depthWrite: false, blending: AdditiveBlending }));
	energyShield.scale.copy(shield.scale).multiplyScalar(1.015); energyShield.position.copy(shield.position); energyShield.visible = false; scene.add(energyShield);
	const range = new Line(new BufferGeometry(), new LineBasicMaterial({ color: '#77dec8', transparent: true, opacity: 0.22, depthWrite: false })); scene.add(range);
	let coverageSignature = '';
	const rally = circle('#b7dbe4', 25, 0.7, 1); scene.add(rally);
	const field = circle('#d7bf89', INTERDICTION_CONFIG.radius, 0.85, 2); field.visible = false; scene.add(field);
	const buoy = new Mesh(new IcosahedronGeometry(8, 0), new MeshBasicMaterial({ color: '#d7bf89' })); buoy.visible = false; scene.add(buoy);
	const fieldPreview = circle('#d0e7a6', INTERDICTION_CONFIG.radius, 0.65, 2); fieldPreview.visible = false; scene.add(fieldPreview);
	const placementRange = circle('#d7bf89', INTERDICTION_CONFIG.maxRange, 0.18, 1); placementRange.position.y = FLIGHT_HEIGHT; placementRange.visible = false; scene.add(placementRange);
	const priority = circle('#f4d68a', 1, 0.9, 0.025); scene.add(priority);
	const gate = new Group();
	for (const [radius, tube, color] of [[170, 9, '#234c4b'], [150, 3, '#83dfcb']] as const) {
		const torus = new Mesh(new TorusGeometry(radius, tube, 10, 96), new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: radius === 150 ? 0.6 : 0.05, roughness: 0.6, metalness: 0.4 }));
		torus.rotation.y = Math.PI / 2; gate.add(torus);
	}
	scene.add(gate);
	const beacons = Array.from({ length: 7 }, function (_, index) {
		const group = new Group();
		for (const across of [-140, 140]) {
			const rod = new Mesh(new IcosahedronGeometry(1, 0), new MeshStandardMaterial({ color: '#527887', emissive: '#203d4c' }));
			rod.scale.set(3, 24, 3); rod.position.set(0, 0, across); group.add(rod);
			const lamp = new Mesh(new SphereGeometry(3, 8, 6), new MeshBasicMaterial({ color: '#9ce4d9' }));
			lamp.position.set(0, 24, across); group.add(lamp);
		}
		group.name = `beacon-${index}`; scene.add(group); return group;
	});
	const stars = [0.08, 0.2, 0.46].map(function (parallax, layer) {
		const positions = new Float32Array(100 * 3);
		for (let i = 0; i < 100; i++) { positions[i * 3] = (i * 173.73 + layer * 313) % 3000 - 1500; positions[i * 3 + 1] = (i * 97.31) % 1600 - 800; positions[i * 3 + 2] = (i * 239.17) % 2400 - 1200; }
		const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(positions, 3));
		const points = new Points(geometry, new PointsMaterial({ color: layer === 2 ? '#7a94a6' : '#3b5064', size: layer === 2 ? 1.8 : 1.2, sizeAttenuation: false, depthWrite: false }));
		scene.add(points); return { points, parallax, origins: positions.slice() };
	});
	const rocks = Array.from({ length: 24 }, function (_, i) {
		const rock = new Mesh(new IcosahedronGeometry(18 + i * 11 % 27, 0), new MeshStandardMaterial({ color: '#1a2b3b', roughness: 1 }));
		rock.position.set(i * 347 % 2200 - 1100, -160 - i % 3 * 40, (i % 2 === 0 ? -1 : 1) * (350 + i * 83 % 280));
		rock.rotation.set(i * 0.4, i, i * 0.17); scene.add(rock); return { rock, x: rock.position.x };
	});
	const navPositions: number[] = [];
	for (let i = -10; i <= 10; i++) {
		navPositions.push(i * 160, -105, -1000, i * 160, -105, 1000);
		navPositions.push(-1800, -105, i * 160, 1800, -105, i * 160);
	}
	const navGeometry = new BufferGeometry(); navGeometry.setAttribute('position', new BufferAttribute(new Float32Array(navPositions), 3));
	const navigation = new LineSegments(navGeometry, new LineBasicMaterial({ color: '#254255', transparent: true, opacity: 0.24 })); scene.add(navigation);
	const courseGeometry = new BufferGeometry().setFromPoints([new Vector3(-1800, -8, 0), new Vector3(1800, -8, 0)]);
	const course = new Line(courseGeometry, new LineDashedMaterial({ color: '#385c70', dashSize: 6, gapSize: 14, transparent: true, opacity: 0.55 }));
	course.computeLineDistances(); scene.add(course);
	const shotGeometry = new BufferGeometry();
	const shots = new LineSegments(shotGeometry, new LineBasicMaterial({ vertexColors: true }));
	shots.frustumCulled = false; scene.add(shots);
	let shotCapacity = 64;
	let shotPositions = new Float32Array(shotCapacity * 6);
	let shotColors = new Float32Array(shotCapacity * 6);
	shotGeometry.setAttribute('position', new BufferAttribute(shotPositions, 3));
	shotGeometry.setAttribute('color', new BufferAttribute(shotColors, 3));
	shotGeometry.setDrawRange(0, 0);
	const effects: Mesh[] = [];
	const color = new Color();
	let dpr = 0;
	const resize = function () {
		const rect = canvas.getBoundingClientRect(); const ratio = Math.min(devicePixelRatio, 2);
		if (rect.width === view.width && rect.height === view.height && ratio === dpr) return;
		dpr = ratio; view = resizeView(view, rect.width, rect.height);
		renderer.setPixelRatio(ratio); renderer.setSize(rect.width, rect.height, false);
		overlay.width = Math.round(rect.width * ratio); overlay.height = Math.round(rect.height * ratio);
		labelsDirty = true;
	};
	const hit = function (point: Point, roots: Object3D[]): PickTarget | undefined {
		if (view.width <= 0 || view.height <= 0) return undefined;
		view.camera.updateMatrixWorld(true);
		raycaster.setFromCamera(new Vector2(point.x / view.width * 2 - 1, 1 - point.y / view.height * 2), view.camera);
		for (const intersection of raycaster.intersectObjects(roots, true)) {
			if (!visible(intersection.object)) continue;
			let object: Object3D | null = intersection.object;
			while (object) { const target = targets.get(object); if (target) return target; object = object.parent; }
		}
		return undefined;
	};
	const arkRoots = [ark, ...turrets.map(function (turret) { return turret.root; })];
	const updateVisibility = function (state: State) {
		const signature = state.mounts.map(function (mount) { return mount.weapon ?? ''; }).join(',');
		if (signature !== mountSignature) { mountSignature = signature; labelsDirty = true; }
		if (!labelsDirty) return;
		mountVisibility = state.mounts.map(function (mount, index) { const target = hit(toScreen(mount, view, mountHeight(mount)), arkRoots); return target?.kind === 'mount' && target.index === index; });
		labelsDirty = false;
	};
	const text = function (value: string, point: Point, fill: string, size = 10) {
		ctx.font = `${size}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.fillStyle = fill; ctx.fillText(value, point.x, point.y);
	};
	const drawLabels = function (state: State, selected: number) {
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, view.width, view.height);
		for (const [value, point] of [['PORT', { x: 0, y: -380 }], ['STARBOARD', { x: 0, y: 380 }], ['BOW →', { x: 420, y: 0 }], ['← ASTERN', { x: -420, y: 0 }]] as const) text(value, toScreen(point, view), '#63818f', view.width < 650 ? 8 : 10);
		for (const [index, mount] of state.mounts.entries()) {
			if (!mountVisibility[index]) continue;
			const point = toScreen(mount, view, mountHeight(mount) + 12);
			text(String(index + 1), { x: point.x, y: point.y - 10 }, selected === index ? '#e1f3c1' : '#b4c8d4', view.width < 650 ? 10 : 11);
		}
		let bomberLabelShown = false;
		for (const enemy of state.enemies) {
			const intel = contactIntel(state, enemy);
			if (intel === 'unseen') continue;
			if (enemy.detour) text('DETOUR', toScreen(enemy, view, FLIGHT_HEIGHT + 20), '#d7bf89', 9);
			if (intel === 'detected') text('?', toScreen(enemy, view, FLIGHT_HEIGHT + 36), '#d7bf89', 12);
			if (intel === 'classified' && enemy.kind === 'bomber' && !bomberLabelShown) {
				text('BOMBER · ARRAY ROUNDS', toScreen(enemy, view, FLIGHT_HEIGHT + 52), '#f59682', 9); bomberLabelShown = true;
			}
			if (intel === 'classified' && (enemy.hp < enemy.maxHp || enemy.kind === 'flagship')) {
				const at = toScreen(enemy, view, FLIGHT_HEIGHT + (enemy.kind === 'flagship' ? 74 : 29)); const width = enemy.kind === 'flagship' ? 75 : 26;
				ctx.fillStyle = '#142332'; ctx.fillRect(at.x - width / 2, at.y, width, 3);
				ctx.fillStyle = '#e78b82'; ctx.fillRect(at.x - width / 2, at.y, width * Math.max(0, enemy.hp / enemy.maxHp), 3);
			}
			const marker = edgeIndicator(enemy, view); if (!marker) continue;
			ctx.save(); ctx.translate(marker.point.x, marker.point.y); ctx.rotate(marker.angle);
			ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -5); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fillStyle = '#f59682'; ctx.fill(); ctx.restore();
			if (intel === 'detected') text('?', { x: marker.point.x, y: marker.point.y - 10 }, '#d7bf89', 11);
		}
		for (const escort of state.escorts) if (escort.sector) text(`G${escort.id} · ${escort.sector}`, toScreen(escort, view, FLIGHT_HEIGHT + 42), '#a6d4d9', 9);
		for (const escort of state.escorts) if (escort.hp < ESCORTS[escort.kind].hp) { const at = toScreen(escort, view, FLIGHT_HEIGHT + 29); ctx.fillStyle = '#89d5de'; ctx.fillRect(at.x - 13, at.y, 26 * Math.max(0, escort.hp / ESCORTS[escort.kind].hp), 3); }
		const position = fieldRelative(state); const activeField = state.systems.interdiction.field;
		if (position && activeField) text(`INTERDICTION · ${Math.ceil(activeField.remaining)}s`, toScreen(position, view, FLIGHT_HEIGHT + 30), '#d7bf89', 10);
		for (let i = 0; i <= 6; i++) { const point = beaconFor(i, state); if (Math.abs(point.x) > 950) continue; text(i === 0 ? 'DEPARTURE' : i === 6 ? 'KEPLER APPROACH' : `NAV ${String(i).padStart(2, '0')}`, toScreen({ x: point.x, y: 180 }, view, -5), '#6e939f', 9); }
		if (journeyFor(state).remaining <= 1100) text('KEPLER GATE', toScreen({ x: journeyFor(state).remaining, y: 0 }, view, 220), '#83dfcb');
	};

	return {
		render: function (state, selected, reducedMotion, rallyMode, controlsEnabled, placement) {
			if (disposed) return;
			resize(); if (view.width <= 0 || view.height <= 0) return;
			controls.enabled = controlsEnabled; controls.update();
			for (const [index, turret] of turrets.entries()) { const mount = state.mounts[index]; if (mount) turret.update(mount, selected === index); }
			const journey = journeyFor(state); const drift = reducedMotion ? 0 : journey.distance;
			const fieldPosition = fieldRelative(state); field.visible = !!fieldPosition; buoy.visible = !!fieldPosition;
			if (fieldPosition) { field.position.set(fieldPosition.x, FLIGHT_HEIGHT, fieldPosition.y); buoy.position.set(fieldPosition.x, FLIGHT_HEIGHT + 8, fieldPosition.y); }
			fieldPreview.visible = !!placement; placementRange.visible = !!placement;
			if (placement) {
				fieldPreview.position.set(placement.x, FLIGHT_HEIGHT, placement.y);
				if (fieldPreview.material instanceof MeshBasicMaterial) fieldPreview.material.color.set(interdictionReason(state, placement) ? '#f19686' : '#d0e7a6');
			}
			const flicker = reducedMotion ? 0 : Math.sin(state.time * 17) * 4;
			for (const drive of drives) if (drive) drive.traverse(function (object) { if (object instanceof Mesh) { const materials = Array.isArray(object.material) ? object.material : [object.material]; for (const material of materials) if (material instanceof MeshStandardMaterial) material.emissiveIntensity = journey.speed > 0 ? 3.2 + flicker * 0.05 : 1.5; } });
			for (const { plume, origin } of plumes) { const length = (58 + flicker) * journey.speed / CRUISE_SPEED; plume.visible = journey.speed > 0; plume.scale.y = length; plume.position.set(origin.x - length / 2 - 2, origin.y, origin.z); }
			const shieldView = shieldAppearance(state);
			shield.visible = shieldView.aegisVisible; energyShield.visible = shieldView.energyVisible;
			energyShield.material.opacity = shieldView.energyOpacity; energyShield.material.color.set(shieldView.energyColor);
			const mount = state.mounts[selected];
			range.visible = !!mount?.weapon;
			if (mount?.weapon) {
				const coverage = coverageFor(state, mount); const signature = `${selected}/${coverage.range}/${coverage.arc}`;
				if (signature !== coverageSignature) {
					const points = Array.from({ length: 97 }, function (_, i) { const angle = coverage.center - coverage.arc / 2 + coverage.arc * i / 96; return new Vector3(Math.cos(angle) * coverage.range, 0, Math.sin(angle) * coverage.range); });
					if (coverage.arc < Math.PI * 2) { points.unshift(new Vector3()); points.push(new Vector3()); }
					range.geometry.dispose(); range.geometry = new BufferGeometry().setFromPoints(points); coverageSignature = signature;
				}
				range.position.set(mount.x, TURRET_HEIGHT, mount.y);
			}
			rally.visible = !state.experimental && (state.escorts.length > 0 || rallyMode); rally.position.set(state.rally.x, 1, state.rally.y);
			if (rally.material instanceof MeshBasicMaterial) rally.material.color.set(rallyMode ? '#d5ed9b' : '#9edbf0');
			const target = state.enemies.find(function (enemy) { return enemy.id === state.priority && canAcquire(state, enemy); }); priority.visible = !!target;
			if (target) { priority.position.set(target.x, FLIGHT_HEIGHT, target.y); priority.scale.setScalar(target.kind === 'flagship' ? 70 : 42); }
			const liveEnemies = new Set(state.enemies.map(function (enemy) { return enemy.id; }));
			for (const [id, model] of enemyModels) if (!liveEnemies.has(id)) { scene.remove(model); targets.delete(model); disposeObject(model); enemyModels.delete(id); }
			for (const enemy of state.enemies) { let model = enemyModels.get(enemy.id); if (!model) { model = createEnemy(enemy); enemyModels.set(enemy.id, model); targets.set(model, { kind: 'enemy', id: enemy.id }); scene.add(model); } model.position.set(enemy.x, FLIGHT_HEIGHT, enemy.y); const heading = enemy.detour ? { x: enemy.detour.waypoint.x - state.systems.distanceTraveled, y: enemy.detour.waypoint.y } : { x: 0, y: 0 }; model.rotation.y = -Math.atan2(heading.y - enemy.y, heading.x - enemy.x); }
			const liveEscorts = new Set(state.escorts.map(function (escort) { return escort.id; }));
			for (const [id, model] of escortModels) if (!liveEscorts.has(id)) { scene.remove(model); disposeObject(model); escortModels.delete(id); }
			for (const escort of state.escorts) { let model = escortModels.get(escort.id); if (!model) { model = createEscort(escort); escortModels.set(escort.id, model); scene.add(model); } model.position.set(escort.x, FLIGHT_HEIGHT, escort.y); model.rotation.y = -escort.angle; }
			if (state.shots.length > shotCapacity) { shotGeometry.dispose(); shotCapacity = state.shots.length * 2; shotPositions = new Float32Array(shotCapacity * 6); shotColors = new Float32Array(shotCapacity * 6); shotGeometry.setAttribute('position', new BufferAttribute(shotPositions, 3)); shotGeometry.setAttribute('color', new BufferAttribute(shotColors, 3)); }
			const liveShots = new Set(state.shots.map(function (shot) { return shot.id; }));
			for (const id of trajectories.keys()) if (!liveShots.has(id)) trajectories.delete(id);
			for (const [index, shot] of state.shots.entries()) {
				let trajectory = trajectories.get(shot.id); if (!trajectory) { trajectory = createTrajectory(shot, state); trajectories.set(shot.id, trajectory); }
				const target = shot.side === 'player' ? state.enemies.find(function (enemy) { return enemy.id === shot.target; }) : state.escorts.find(function (escort) { return escort.id === shot.target; });
				const tailTime = shot.weapon === 'rail' ? 0.04 : 0.025;
				const tail = shot.beamFrom ?? { x: shot.x - shot.vx * tailTime, y: shot.y - shot.vy * tailTime };
				shotPositions.set([tail.x, projectileHeight(tail, trajectory, target), tail.y, shot.x, projectileHeight(shot, trajectory, target), shot.y], index * 6);
				color.set(shot.side === 'enemy' ? shot.sensorDamage ? '#f7c76e' : '#ff8d7f' : shot.weapon === 'beam' ? '#ff86c8' : shot.weapon === 'rail' ? '#dbbeff' : shot.weapon === 'missile' ? '#f5ce8a' : '#99ece1'); shotColors.set([color.r, color.g, color.b, color.r, color.g, color.b], index * 6);
			}
			if (shotCapacity > 0) { shotGeometry.getAttribute('position').needsUpdate = true; shotGeometry.getAttribute('color').needsUpdate = true; } shotGeometry.setDrawRange(0, state.shots.length * 2);
			while (effects.length < state.effects.length) { const effect = circle('#ffffff', 1, 1); scene.add(effect); effects.push(effect); }
			for (const [index, model] of effects.entries()) { const effect = state.effects[index]; model.visible = !!effect; if (effect) { model.position.set(effect.x, effectHeight(effect, state), effect.y); model.scale.setScalar(effect.radius * (1 - effect.life / effect.maxLife * 0.7)); if (model.material instanceof MeshBasicMaterial) { model.material.transparent = true; model.material.color.set(effect.color); model.material.opacity = effect.life / effect.maxLife; } } }
			gate.visible = journey.remaining <= 1100; gate.position.set(journey.remaining, 25, 0);
			for (const [index, beacon] of beacons.entries()) { const at = beaconFor(index, state); beacon.position.x = at.x; beacon.visible = Math.abs(at.x) <= 1100; }
			for (const { points, parallax, origins } of stars) { const position = points.geometry.getAttribute('position'); for (let i = 0; i < position.count; i++) position.setX(i, (((origins[i * 3] ?? 0) - drift * parallax + 1500) % 3000 + 3000) % 3000 - 1500); position.needsUpdate = true; }
			for (const { rock, x } of rocks) rock.position.x = ((x - drift * 0.72 + 1100) % 2200 + 2200) % 2200 - 1100;
			navigation.position.x = -(drift % 160);
			scene.updateMatrixWorld(true); updateVisibility(state); renderer.render(scene, view.camera); drawLabels(state, selected);
		},
		pick: function (point, state) {
			resize(); scene.updateMatrixWorld(true); updateVisibility(state);
			const roots = [...arkRoots, ...enemyModels.values()];
			const direct = hit(point, roots);
			let mount = direct?.kind === 'mount' ? direct.index : -1;
			let enemy = direct?.kind === 'enemy' ? state.enemies.find(function (candidate) { return candidate.id === direct.id; }) : undefined;
			if (mount < 0 && !enemy) { const candidate = pickMount(point, view, state.mounts); if (candidate >= 0 && mountVisibility[candidate]) mount = candidate; }
			if (mount < 0 && !enemy) { const candidate = pickEnemy(point, view, state.enemies); if (candidate) { const center = hit(toScreen(candidate, view, FLIGHT_HEIGHT), roots); if (center?.kind === 'enemy' && center.id === candidate.id) enemy = candidate; } }
			return { mount, enemy, world: toWorld(point, view) };
		},
		placementPoint: function (point) { resize(); return toWorld(point, view, FLIGHT_HEIGHT); },
		resetCamera: function () { controls.reset(); labelsDirty = true; },
		cancelInteraction: function () { controls.disconnect(); controls.connect(canvas); },
		getView: function () { return view; },
		dispose: cleanup,
	};
};
