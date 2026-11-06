import { createBackdrop } from './backdrop';
import { createConvoyCraft } from './convoy-craft';
import { OPERATIONS } from './operations';
import { MIN_CAMERA_ZOOM } from './combat-scale';
import { FORMATION, FORMATION_RADII, FORMATION_SLOTS, HULLS, type Formation } from './formation';
import { COMBAT_EFFECT_LIMIT, createCombatVisual } from './combat-feedback';
import { bomberCue, placeBomberCue } from './bomber-cue';
import { updateCraftTurrets } from './craft-3d';
import { ACESFilmicToneMapping, AdditiveBlending, BufferAttribute, BufferGeometry, Color, ConeGeometry, DirectionalLight, DoubleSide, Group, HemisphereLight, IcosahedronGeometry, InstancedMesh, Line, LineBasicMaterial, LineDashedMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, MOUSE, Object3D, PCFShadowMap, Raycaster, RingGeometry, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnemy, createEscort, createTurret, disposeObject, type TurretVisual } from './actors-3d';
import { DECK_HEIGHT, edgeIndicator, FLIGHT_HEIGHT, mountHeight, offsetView, pickEnemy, pickMount, resizeView, toScreen, toWorld, TURRET_HEIGHT, viewFor, type View } from './projection';
import { beaconFor, CRUISE_SPEED, journeyFor } from './journey';
import { createConvoyState, coverageFor, ESCORTS, interdictionReason, type Enemy, type Point, type State } from './simulation';
import { SHIELD_CENTER, SHIELD_RADII } from './ship-config';
import { createTrajectory, projectileHeight, type Trajectory } from './projectiles-3d';
import { shieldAppearance } from './shield-view';
import { canAcquire, contactIntel } from './sensors';
import { enemyVisibility } from './enemy-visibility';
import { INTERDICTION_CONFIG } from './interdiction';
import { mountWorld, worldPoint } from './space';
import { drawTacticalRing } from './tactical-ring';
import { focusedShip, type FleetFocus } from './fleet-focus';

type PickTarget = { kind: 'mount'; index: number } | { kind: 'enemy'; id: number } | { kind: 'fleet'; id: FleetFocus };
export interface PickResult { mount: number; enemy: Enemy | undefined; world: Point | undefined; slot?: Formation; fleet?: FleetFocus }
export interface Presentation {
	render: (state: State, selected: number, reducedMotion: boolean, controlsEnabled: boolean, placement?: Point, screenOffsetY?: number, screenOffsetX?: number, selectedSlot?: Formation, cinematic?: boolean) => void;
	orbitCamera: (horizontal: number, vertical: number, zoom: number, deltaSeconds: number) => void;
	pick: (point: Point, state: State) => PickResult;
	placementPoint: (point: Point) => Point | undefined;
	resetCamera: () => void;
	focusShip: (id: FleetFocus) => void;
	getFocus: () => FleetFocus;
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
	const carrier = new Group(); scene.add(carrier);
	const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
	renderer.setClearColor('#070e17');
	renderer.outputColorSpace = SRGBColorSpace;
	renderer.toneMapping = ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.1;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = PCFShadowMap;
	let view = viewFor(1, 1);
	view.camera.zoom = 0.28; view.camera.updateProjectionMatrix();
	const controls = new OrbitControls(view.camera, canvas);
	controls.enablePan = false;
	controls.enableDamping = false;
	controls.minPolarAngle = Math.PI / 8;
	controls.maxPolarAngle = Math.PI / 2 - 0.35;
	controls.minZoom = MIN_CAMERA_ZOOM;
	controls.maxZoom = 2;
	controls.mouseButtons.LEFT = MOUSE.ROTATE;
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
	const detectedMarkers = new Map<number, Mesh>();
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
		scene.traverse(function (object) { if (object instanceof DirectionalLight) object.shadow.dispose(); if (object instanceof InstancedMesh) object.dispose(); });
		disposeObject(scene);
		scene.clear();
		renderer.dispose();
		renderer.forceContextLoss();
		overlay.remove();
	};
	let ark: Group;
	let enemyCarrier: Group;
	try {
		const model = await new GLTFLoader().loadAsync(new URL('./models/gateward-ark.glb', document.baseURI).href);
		ark = model.scene; carrier.add(ark);
		enemyCarrier = (await new GLTFLoader().loadAsync(new URL('./models/gateward-carrier.glb', document.baseURI).href)).scene;
		enemyCarrier.visible = false; scene.add(enemyCarrier);
		ark.updateMatrixWorld(true);
		const mounts = createConvoyState().mounts.filter(function (mount) { return mount.platform === undefined; });
		for (const [index, mount] of mounts.entries()) {
			const anchor = ark.getObjectByName(`Mount_${String(index + 1).padStart(2, '0')}`);
			if (!anchor || anchor.getWorldPosition(new Vector3()).distanceTo(new Vector3(mount.x, DECK_HEIGHT, mount.y)) > 0.05)
				throw new Error(`Invalid ship hardpoint ${index + 1}`);
			targets.set(anchor, { kind: 'mount', index });
		}
		ark.traverse(function (object) { if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; } });
		targets.set(ark, { kind: 'fleet', id: 'ark' });
	} catch (error: unknown) { cleanup(); throw error; }

	const light = new DirectionalLight('#fff1d9', 3.5);
	light.position.set(-240, 540, 320);
	light.castShadow = true;
	light.shadow.mapSize.set(1024, 1024);
	light.shadow.camera.left = -450; light.shadow.camera.right = 450;
	light.shadow.camera.top = 350; light.shadow.camera.bottom = -350;
	light.shadow.camera.near = 1; light.shadow.camera.far = 1600;
	light.shadow.bias = -0.0003;
	light.shadow.normalBias = 0.3;
	scene.add(light, light.target, new HemisphereLight('#a7c7d4', '#172331', 1.7));
	const fill = new DirectionalLight('#6bcbcf', 1.6);
	fill.position.set(250, 100, -400); scene.add(fill, fill.target);
	const turrets: TurretVisual[] = [];
	const platforms = new Map<number, ReturnType<typeof createConvoyCraft>>();
	const formation = new Group(); carrier.add(formation);
	for (const radius of [FORMATION_RADII.inner, FORMATION_RADII.middle]) {
		const guide = circle('#6a9daa', radius, 0.3, 3);
		guide.position.y = DECK_HEIGHT - 30; formation.add(guide);
	}
	const slotMarkers = FORMATION.map(function (slot) {
		const station = FORMATION_SLOTS[slot];
		const marker = circle('#89bac5', 82, 0.7, 4);
		marker.position.set(station.x, DECK_HEIGHT - 25, station.y); formation.add(marker);
		return { slot, marker };
	});
	const syncFleet = function (state: State) {
		while (turrets.length > state.mounts.length) {
			const turret = turrets.pop();
			if (turret) { carrier.remove(turret.root); targets.delete(turret.root); disposeObject(turret.root); labelsDirty = true; }
		}
		for (const [index, mount] of state.mounts.entries()) {
			if (turrets[index]) continue;
			const turret = createTurret(mount); turrets.push(turret);
			carrier.add(turret.root); targets.set(turret.root, { kind: 'mount', index }); labelsDirty = true;
		}
		const live = new Set(state.convoy?.platforms.map(function (platform) { return platform.id; }) ?? []);
		for (const [id, hull] of platforms) if (!live.has(id)) { carrier.remove(hull.root); targets.delete(hull.root); disposeObject(hull.root); platforms.delete(id); labelsDirty = true; }
		for (const platform of state.convoy?.platforms ?? []) {
			if (platforms.has(platform.id)) continue;
			const hull = createConvoyCraft(platform.hull);
			carrier.add(hull.root); platforms.set(platform.id, hull); targets.set(hull.root, { kind: 'fleet', id: `platform:${platform.id}` }); labelsDirty = true;
		}
	};
	const drives = [1, 2, 3, 4].map(function (index) { return ark.getObjectByName(`Drive_${String(index).padStart(2, '0')}`); });
	const plumes = drives.flatMap(function (drive) {
		if (!drive) return [];
		const plume = new Mesh(new ConeGeometry(11, 1, 12, 1, true), new MeshBasicMaterial({ color: '#9ed8e0', transparent: true, opacity: 0.24, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
		plume.rotation.z = Math.PI / 2; carrier.add(plume);
		return [{ plume, origin: drive.getWorldPosition(new Vector3()) }];
	});
	const shield = new Mesh(new SphereGeometry(1, 40, 24), new MeshBasicMaterial({ color: '#88f1e4', transparent: true, opacity: 0.065, depthWrite: false, blending: AdditiveBlending }));
	shield.scale.set(SHIELD_RADII.x, SHIELD_RADII.y, SHIELD_RADII.z); shield.position.set(SHIELD_CENTER.x, SHIELD_CENTER.y, SHIELD_CENTER.z); shield.visible = false; carrier.add(shield);
	const energyShield = new Mesh(new SphereGeometry(1, 40, 24), new MeshBasicMaterial({ color: '#75bfe8', transparent: true, opacity: 0.012, depthWrite: false, blending: AdditiveBlending }));
	energyShield.scale.copy(shield.scale).multiplyScalar(1.015); energyShield.position.copy(shield.position); energyShield.visible = false; carrier.add(energyShield);
	const range = new Line(new BufferGeometry(), new LineBasicMaterial({ color: '#77dec8', transparent: true, opacity: 0.22, depthWrite: false })); carrier.add(range);
	let coverageSignature = '';
	const field = circle('#d7bf89', INTERDICTION_CONFIG.radius, 0.85, 2); field.visible = false; scene.add(field);
	const buoy = new Mesh(new IcosahedronGeometry(8, 0), new MeshBasicMaterial({ color: '#d7bf89' })); buoy.visible = false; scene.add(buoy);
	const fieldPreview = circle('#d0e7a6', INTERDICTION_CONFIG.radius, 0.65, 2); fieldPreview.visible = false; scene.add(fieldPreview);
	const placementRange = circle('#d7bf89', INTERDICTION_CONFIG.maxRange, 0.18, 1); placementRange.position.y = FLIGHT_HEIGHT; placementRange.visible = false; carrier.add(placementRange);
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
	const updateBackdrop = createBackdrop(scene);
	const course = new Line(new BufferGeometry(), new LineDashedMaterial({ color: '#385c70', dashSize: 6, gapSize: 14, transparent: true, opacity: 0.55 })); scene.add(course);
	let routeSignature = '';
	const updateRoute = function (state: State) {
		const signature = `${state.routeOrigin.x}/${state.routeOrigin.y}/${state.systems.routeLength}`;
		if (signature === routeSignature) return;
		routeSignature = signature;
		const end = state.systems.routeLength + 1600;
		course.geometry.dispose(); course.geometry = new BufferGeometry().setFromPoints([new Vector3(-1600, -8, 0), new Vector3(end, -8, 0)]);
		course.position.set(state.routeOrigin.x, 0, state.routeOrigin.y); course.computeLineDistances();
	};
	const cameraAnchor = new Vector3();
	let focus: FleetFocus = 'ark';
	let carrierAngle = 0;
	let cinematicView = false;
	const followFleet = function (state: State) {
		const ship = focusedShip(state, focus); focus = ship.id;
		const anchor = new Vector3(ship.point.x, ship.elevation, ship.point.y);
		if (!cameraAnchor.equals(anchor)) {
			view.camera.position.add(anchor.clone().sub(cameraAnchor));
			controls.target.copy(anchor); cameraAnchor.copy(anchor); labelsDirty = true;
		}
		if (carrierAngle !== state.ark.angle) { carrierAngle = state.ark.angle; labelsDirty = true; }
		carrier.position.set(state.ark.x, 0, state.ark.y); carrier.rotation.y = -state.ark.angle;
		light.position.set(state.ark.x - 240, 540, state.ark.y + 320); light.target.position.set(state.ark.x, 0, state.ark.y);
		fill.position.set(state.ark.x + 250, 100, state.ark.y - 400); fill.target.position.copy(light.target.position);
	};
	const shotGeometry = new BufferGeometry();
	const shots = new LineSegments(shotGeometry, new LineBasicMaterial({ vertexColors: true }));
	shots.frustumCulled = false; scene.add(shots);
	let shotCapacity = 64;
	let shotPositions = new Float32Array(shotCapacity * 6);
	let shotColors = new Float32Array(shotCapacity * 6);
	shotGeometry.setAttribute('position', new BufferAttribute(shotPositions, 3));
	shotGeometry.setAttribute('color', new BufferAttribute(shotColors, 3));
	shotGeometry.setDrawRange(0, 0);
	const effects: ReturnType<typeof createCombatVisual>[] = [];
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
	const arkRoots = function (): Object3D[] { return [ark, ...turrets.map(function (turret) { return turret.root; }), ...Array.from(platforms.values(), function (hull) { return hull.root; })]; };
	const updateVisibility = function (state: State) {
		const signature = state.mounts.map(function (mount) { return `${mount.x}/${mount.y}/${mount.integrity}/${mount.weapon ?? ''}`; }).join(',');
		if (signature !== mountSignature) { mountSignature = signature; labelsDirty = true; }
		if (!labelsDirty) return;
		mountVisibility = state.mounts.map(function (mount, index) { const target = hit(toScreen(mountWorld(state, mount), view, mountHeight(mount)), arkRoots()); return target?.kind === 'mount' && target.index === index; });
		labelsDirty = false;
	};
	const text = function (value: string, point: Point, fill: string, size = 10) {
		ctx.font = `${size}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.fillStyle = fill; ctx.fillText(value, point.x, point.y);
	};
	const drawLabels = function (state: State, selected: number, selectedSlot?: Formation) {
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, view.width, view.height);
		drawTacticalRing(ctx, state, view);
		for (const [value, point] of [['PORT', { x: 0, y: -380 }], ['STARBOARD', { x: 0, y: 380 }], ['BOW →', { x: 420, y: 0 }], ['← ASTERN', { x: -420, y: 0 }]] as const) text(value, toScreen(worldPoint(state, point), view), '#63818f', view.width < 650 ? 8 : 10);
		for (const [index, mount] of state.mounts.entries()) {
			if (!mountVisibility[index]) continue;
			const point = toScreen(mountWorld(state, mount), view, mountHeight(mount) + 12);
			text(String(index + 1), { x: point.x, y: point.y - 10 }, selected === index ? '#e1f3c1' : '#b4c8d4', view.width < 650 ? 10 : 11);
		}
		if (state.convoy && state.status === 'fitting') {
			for (const [index, slot] of FORMATION.entries()) {
				if (state.convoy.platforms.some(function (platform) { return platform.slot === slot; })) continue;
				const point = toScreen(worldPoint(state, FORMATION_SLOTS[slot]), view, DECK_HEIGHT);
				text('+', point, slot === selectedSlot ? '#f4d68a' : '#9bc8d3', 22);
				text(`${index < 6 ? 'INNER' : 'MID'} ${index < 6 ? index + 1 : index - 5}`, { x: point.x, y: point.y + 20 }, slot === selectedSlot ? '#f4d68a' : '#91b1bd', 10);
			}
		}
		for (const platform of state.convoy?.platforms ?? []) {
			if (platform.hp <= 0) continue;
			const at = toScreen(worldPoint(state, FORMATION_SLOTS[platform.slot]), view, DECK_HEIGHT + 110);
			text(`P${platform.id + 1} / ${HULLS[platform.hull].name.toUpperCase()}`, at, state.mounts[selected]?.platform === platform.id ? '#ebd49b' : '#b4c8d4', 10);
			if (state.status === 'running' || platform.hp < HULLS[platform.hull].hp) {
				const health = platform.hp / HULLS[platform.hull].hp;
				ctx.fillStyle = '#24343e'; ctx.fillRect(at.x - 22, at.y + 5, 44, 3);
				ctx.fillStyle = health < 0.35 ? '#efaa7b' : '#91ccc4'; ctx.fillRect(at.x - 22, at.y + 5, 44 * health, 3);
			}
		}
		const cuePositions: Point[] = [];
		const cues: { text: string; progress: number; color: string; point: Point; anchor: Point }[] = [];
		for (const enemy of state.enemies) {
			const intel = contactIntel(state, enemy);
			if (intel === 'unseen') continue;
			if (enemy.detour) text('DETOUR', toScreen(enemy, view, (enemy.z ?? 0) + FLIGHT_HEIGHT + 20), '#d7bf89', 9);
			if (intel === 'detected') text('?', toScreen(enemy, view, (enemy.z ?? 0) + FLIGHT_HEIGHT + 36), '#d7bf89', 12);
			const cue = bomberCue(state, enemy);
			const anchor = toScreen(enemy, view, (enemy.z ?? 0) + FLIGHT_HEIGHT + 52);
			const cueAt = cue && !edgeIndicator(enemy, view) ? placeBomberCue(anchor, view.width, view.height, cuePositions) : undefined;
			if (cue && cueAt) {
				cuePositions.push(cueAt);
				cues.push({ ...cue, point: cueAt, anchor });
			}
			if (intel === 'classified' && (enemy.hp < enemy.maxHp || enemy.kind === 'flagship' || enemy.kind === 'carrier')) {
				const at = toScreen(enemy, view, (enemy.z ?? 0) + FLIGHT_HEIGHT + (enemy.kind === 'carrier' ? 58 : enemy.kind === 'flagship' ? 100 : 40)); const width = enemy.kind === 'carrier' || enemy.kind === 'flagship' ? 90 : 32;
				ctx.fillStyle = '#142332'; ctx.fillRect(at.x - width / 2, at.y, width, 3);
				ctx.fillStyle = '#e78b82'; ctx.fillRect(at.x - width / 2, at.y, width * Math.max(0, enemy.hp / enemy.maxHp), 3);
			}
		}
		for (const escort of state.escorts) if (escort.sector) text(`G${escort.id} · ${escort.sector}`, toScreen(escort, view, (escort.z ?? 0) + FLIGHT_HEIGHT + 42), '#a6d4d9', 9);
		for (const escort of state.escorts) if (escort.hp < ESCORTS[escort.kind].hp) { const at = toScreen(escort, view, (escort.z ?? 0) + FLIGHT_HEIGHT + 29); ctx.fillStyle = '#89d5de'; ctx.fillRect(at.x - 13, at.y, 26 * Math.max(0, escort.hp / ESCORTS[escort.kind].hp), 3); }
		const activeField = state.systems.interdiction.field; const position = activeField?.world;
		if (position && activeField) text(`INTERDICTION · ${Math.ceil(activeField.remaining)}s`, toScreen(position, view, FLIGHT_HEIGHT + 30), '#d7bf89', 10);
		for (let i = 0; i <= 6; i++) { const point = beaconFor(i, state); if (Math.abs(point.x - state.ark.x) > 950) continue; text(i === 0 ? 'DEPARTURE' : i === 6 ? 'FINAL APPROACH' : `NAV ${String(i).padStart(2, '0')}`, toScreen({ x: point.x, y: point.y + 180 }, view, -5), '#6e939f', 9); }
		if (journeyFor(state).remaining <= 1100) text(state.convoy ? OPERATIONS[state.convoy.operation ?? 'kepler'].destination.toUpperCase() : 'KEPLER GATE', toScreen({ x: state.routeOrigin.x + state.systems.routeLength, y: state.routeOrigin.y }, view, 220), '#83dfcb');
		// Attack cues sit above decorative navigation and other contact labels.
		for (const cue of cues) {
			const cueAt = cue.point; const anchor = cue.anchor;
			ctx.strokeStyle = cue.color; ctx.lineWidth = 1;
			ctx.beginPath(); ctx.moveTo(anchor.x, anchor.y + 10); ctx.lineTo(cueAt.x, cueAt.y + 10); ctx.stroke();
			ctx.fillStyle = '#101b29'; ctx.fillRect(cueAt.x - 73, cueAt.y - 12, 146, 23);
			text(cue.text, cueAt, cue.color, 11);
			ctx.fillStyle = '#344453'; ctx.fillRect(cueAt.x - 65, cueAt.y + 5, 130, 3);
			ctx.fillStyle = cue.color; ctx.fillRect(cueAt.x - 65, cueAt.y + 5, 130 * cue.progress, 3);
		}
	};

	return {
		render: function (state, selected, reducedMotion, controlsEnabled, placement, screenOffsetY = 0, screenOffsetX = 0, selectedSlot, cinematic = false) {
			if (disposed) return;
			resize(); if (view.width <= 0 || view.height <= 0) return;
			if (cinematic !== cinematicView) {
				cinematicView = cinematic;
				controls.disconnect(); controls.connect(canvas); controls.reset();
				focus = 'ark'; cameraAnchor.set(0, 0, 0); labelsDirty = true;
				if (cinematic) { controls.rotateUp(controls.getPolarAngle() - 1.08); controls.update(); }
			}
			if (cinematic) {
				view.camera.zoom = view.width < 650 ? 0.42 : 0.48; view.camera.updateProjectionMatrix();
				screenOffsetX = view.width < 650 ? 0 : -view.width * 0.07;
				screenOffsetY = -view.height * 0.12;
			}
			if (offsetView(view, screenOffsetY)) labelsDirty = true;
			if (view.camera.view?.offsetX !== screenOffsetX) {
				view.camera.setViewOffset(view.width, view.height, screenOffsetX, screenOffsetY - view.height * 0.02, view.width, view.height); labelsDirty = true;
			}
			followFleet(state); updateRoute(state); controls.enabled = controlsEnabled && !cinematic; controls.update();
			syncFleet(state);
			formation.visible = !cinematic && !!state.convoy && state.status === 'fitting';
			for (const { slot, marker } of slotMarkers) {
				marker.visible = !state.convoy?.platforms.some(function (platform) { return platform.slot === slot; });
				if (marker.material instanceof MeshBasicMaterial) marker.material.color.set(slot === selectedSlot ? '#f4d68a' : '#89bac5');
			}
			for (const platform of state.convoy?.platforms ?? []) {
				const hull = platforms.get(platform.id); if (!hull) continue;
				const station = FORMATION_SLOTS[platform.slot];
				hull.root.position.set(station.x, DECK_HEIGHT - 15, station.y);
				hull.update(platform.hp, state.mounts[selected]?.platform === platform.id, state.status === 'running', state.time, reducedMotion);
			}
			for (const [index, turret] of turrets.entries()) {
				const mount = state.mounts[index]; if (!mount) continue;
				if (turret.root.position.x !== mount.x || turret.root.position.z !== mount.y) labelsDirty = true;
				turret.root.visible = mount.platform === undefined || !!state.convoy?.platforms.some(function (platform) { return platform.id === mount.platform && platform.hp > 0; });
				const origin = mountWorld(state, mount);
				const beam = state.status === 'running' && state.shots.some(function (shot) { return shot.beamFrom?.x === origin.x && shot.beamFrom.y === origin.y; });
				const firing = state.status === 'running' ? state.effects.reduce<State['effects'][number] | undefined>(function (latest, effect) { return effect.feedback?.kind === 'muzzle' && effect.feedback.mount === index && effect.feedback.weapon === mount.weapon ? effect : latest; }, undefined) : undefined;
				turret.update(mount, selected === index, { strength: beam ? 0.65 : firing ? firing.life / firing.maxLife : 0, beam }, reducedMotion);
			}
			const journey = journeyFor(state);
			const fieldPosition = state.systems.interdiction.field?.world; field.visible = !!fieldPosition; buoy.visible = !!fieldPosition;
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
			range.visible = !cinematic && !!mount?.weapon;
			if (mount?.weapon) {
				const coverage = coverageFor(state, mount); const signature = `${selected}/${coverage.range}/${coverage.arc}/${coverage.center}`;
				if (signature !== coverageSignature) {
					const points = Array.from({ length: 97 }, function (_, i) { const angle = coverage.center - coverage.arc / 2 + coverage.arc * i / 96; return new Vector3(Math.cos(angle) * coverage.range, 0, Math.sin(angle) * coverage.range); });
					if (coverage.arc < Math.PI * 2) { points.unshift(new Vector3()); points.push(new Vector3()); }
					range.geometry.dispose(); range.geometry = new BufferGeometry().setFromPoints(points); coverageSignature = signature;
				}
				range.position.set(mount.x, TURRET_HEIGHT, mount.y);
			}
			const target = state.enemies.find(function (enemy) { return enemy.id === state.priority && canAcquire(state, enemy); }); priority.visible = !!target;
			if (target) { priority.position.set(target.x, FLIGHT_HEIGHT + (target.z ?? 0), target.y); priority.scale.setScalar(contactIntel(state, target) === 'classified' && target.kind === 'flagship' ? 70 : 42); }
			const liveEnemies = new Set(state.enemies.map(function (enemy) { return enemy.id; }));
			for (const [id, model] of enemyModels) if (!liveEnemies.has(id)) { scene.remove(model); targets.delete(model); disposeObject(model); enemyModels.delete(id); }
			for (const [id, marker] of detectedMarkers) if (!liveEnemies.has(id)) { scene.remove(marker); targets.delete(marker); disposeObject(marker); detectedMarkers.delete(id); }
			for (const enemy of state.enemies) {
				const detected = enemyVisibility(state, enemy) === 'marker';
				let marker = detectedMarkers.get(enemy.id);
				if (!marker && detected) { marker = new Mesh(new IcosahedronGeometry(11, 0), new MeshBasicMaterial({ color: '#edbc7e', wireframe: true })); detectedMarkers.set(enemy.id, marker); targets.set(marker, { kind: 'enemy', id: enemy.id }); scene.add(marker); }
				if (marker) { marker.visible = detected; marker.position.set(enemy.x, FLIGHT_HEIGHT + (enemy.z ?? 0), enemy.y); }
			}
			for (const enemy of state.enemies) { let model = enemyModels.get(enemy.id); if (!model) { model = createEnemy(enemy, enemyCarrier); enemyModels.set(enemy.id, model); targets.set(model, { kind: 'enemy', id: enemy.id }); scene.add(model); } model.visible = enemyVisibility(state, enemy) === 'model'; updateCraftTurrets(model, enemy.turretAim); model.position.set(enemy.x, FLIGHT_HEIGHT + (enemy.z ?? 0), enemy.y); model.rotation.y = -(enemy.flight?.angle ?? Math.atan2(state.ark.y - enemy.y, state.ark.x - enemy.x)); model.rotation.z = enemy.flight?.pitch ?? 0; }
			const liveEscorts = new Set(state.escorts.map(function (escort) { return escort.id; }));
			for (const [id, model] of escortModels) if (!liveEscorts.has(id)) { scene.remove(model); targets.delete(model); disposeObject(model); escortModels.delete(id); }
			for (const escort of state.escorts) { let model = escortModels.get(escort.id); if (!model) { model = createEscort(escort); escortModels.set(escort.id, model); targets.set(model, { kind: 'fleet', id: `escort:${escort.id}` }); scene.add(model); } updateCraftTurrets(model, escort.turretAim); model.position.set(escort.x, FLIGHT_HEIGHT + (escort.z ?? 0), escort.y); model.rotation.y = -escort.angle; model.rotation.z = escort.flight?.pitch ?? 0; }
			if (state.shots.length > shotCapacity) { shotGeometry.dispose(); shotCapacity = state.shots.length * 2; shotPositions = new Float32Array(shotCapacity * 6); shotColors = new Float32Array(shotCapacity * 6); shotGeometry.setAttribute('position', new BufferAttribute(shotPositions, 3)); shotGeometry.setAttribute('color', new BufferAttribute(shotColors, 3)); }
			const liveShots = new Set(state.shots.map(function (shot) { return shot.id; }));
			for (const id of trajectories.keys()) if (!liveShots.has(id)) trajectories.delete(id);
			for (const [index, shot] of state.shots.entries()) {
				let trajectory = trajectories.get(shot.id); if (!trajectory || shot.side === 'enemy' && shot.target === undefined) { trajectory = createTrajectory(shot, state); trajectories.set(shot.id, trajectory); }
				const target = shot.side === 'player' ? state.enemies.find(function (enemy) { return enemy.id === shot.target; }) : state.escorts.find(function (escort) { return escort.id === shot.target; });
				const tailTime = shot.weapon === 'rail' ? 0.04 : 0.025;
				const tail = shot.beamFrom ?? { x: shot.x - shot.vx * tailTime, y: shot.y - shot.vy * tailTime, ...(shot.z === undefined ? {} : { z: shot.z - (shot.vz ?? 0) * tailTime }) };
				shotPositions.set([tail.x, projectileHeight(tail, trajectory, target), tail.y, shot.x, projectileHeight(shot, trajectory, target), shot.y], index * 6);
				color.set(shot.side === 'enemy' ? shot.sensorDamage ? '#f7c76e' : '#ff8d7f' : shot.weapon === 'beam' ? '#ff86c8' : shot.weapon === 'rail' ? '#dbbeff' : shot.weapon === 'missile' ? '#f5ce8a' : '#99ece1'); shotColors.set([color.r, color.g, color.b, color.r, color.g, color.b], index * 6);
			}
			if (shotCapacity > 0) { shotGeometry.getAttribute('position').needsUpdate = true; shotGeometry.getAttribute('color').needsUpdate = true; } shotGeometry.setDrawRange(0, state.shots.length * 2);
			const combatVisible = state.status === 'running';
			const activeEffects = combatVisible ? state.effects.filter(function (effect) { return effect.feedback?.kind !== 'muzzle'; }).slice(-COMBAT_EFFECT_LIMIT) : [];
			while (effects.length < activeEffects.length) { const visual = createCombatVisual(); scene.add(visual.root); effects.push(visual); }
			for (const [index, visual] of effects.entries()) { const effect = activeEffects[index]; visual.root.visible = !!effect; if (effect) visual.update(effect, state, reducedMotion); }
			gate.visible = journey.remaining <= 1100; gate.position.set(state.routeOrigin.x + state.systems.routeLength, 25, state.routeOrigin.y);
			for (const [index, beacon] of beacons.entries()) { const at = beaconFor(index, state); beacon.position.set(at.x, 0, at.y); beacon.visible = !cinematic && Math.abs(at.x - state.ark.x) <= 1100; }
			course.visible = !cinematic;
			updateBackdrop(state, view, reducedMotion, cinematic);
			overlay.hidden = cinematic;
			scene.updateMatrixWorld(true); updateVisibility(state); renderer.render(scene, view.camera); if (!cinematic) drawLabels(state, selected, selectedSlot);
		},
		orbitCamera: function (horizontal, vertical, zoom, deltaSeconds) {
			if (disposed || cinematicView) return;
			const bounded = function (value: number) { return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0; };
			const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(0.05, deltaSeconds)) : 0;
			controls.rotateLeft(bounded(horizontal) * dt * 1.65);
			controls.rotateUp(bounded(vertical) * dt * 1.35);
			// OrbitControls handles polar/zoom limits and change notifications for
			// controller and pointer input through the same public methods.
			controls.dollyOut(Math.exp(bounded(zoom) * dt * 1.2));
			controls.update(); labelsDirty = true;
		},
		pick: function (point, state) {
			resize(); followFleet(state); controls.update(); scene.updateMatrixWorld(true); updateVisibility(state);
			const roots = [...arkRoots(), ...escortModels.values(), ...enemyModels.values(), ...detectedMarkers.values()];
			const direct = hit(point, roots);
			let mount = direct?.kind === 'mount' ? direct.index : -1;
			let enemy = direct?.kind === 'enemy' ? state.enemies.find(function (candidate) { return candidate.id === direct.id; }) : undefined;
			const fleet = direct?.kind === 'fleet' ? direct.id : undefined;
			if (mount < 0 && !enemy && !fleet?.startsWith('escort:')) { const candidate = pickMount(point, view, state.mounts.map(function (mount) { return { ...mount, ...mountWorld(state, mount) }; })); if (candidate >= 0 && mountVisibility[candidate]) mount = candidate; }
			if (mount < 0 && !enemy && !fleet) { const candidate = pickEnemy(point, view, state.enemies); if (candidate) { const center = hit(toScreen(candidate, view, FLIGHT_HEIGHT + (candidate.z ?? 0)), roots); if (center?.kind === 'enemy' && center.id === candidate.id) enemy = candidate; } }
			const slot = mount < 0 && !enemy && !fleet && state.convoy && state.status === 'fitting' ? FORMATION.filter(function (candidate) {
				return !state.convoy?.platforms.some(function (platform) { return platform.slot === candidate; });
			}).map(function (candidate) {
				const screen = toScreen(worldPoint(state, FORMATION_SLOTS[candidate]), view, DECK_HEIGHT);
				return { slot: candidate, distance: Math.hypot(screen.x - point.x, screen.y - point.y) };
			}).sort(function (a, b) { return a.distance - b.distance; }).find(function (candidate) { return candidate.distance <= 26; })?.slot : undefined;
			return { mount, enemy, world: toWorld(point, view), ...(slot === undefined ? {} : { slot }), ...(fleet === undefined ? {} : { fleet }) };
		},
		placementPoint: function (point) { resize(); return toWorld(point, view, FLIGHT_HEIGHT); },
		resetCamera: function () { focus = 'ark'; controls.reset(); cameraAnchor.set(0, 0, 0); labelsDirty = true; },
		focusShip: function (id) { focus = id; },
		getFocus: function () { return focus; },
		cancelInteraction: function () { controls.disconnect(); controls.connect(canvas); },
		getView: function () { return view; },
		dispose: cleanup,
	};
};
