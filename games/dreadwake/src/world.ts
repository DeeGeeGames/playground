import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cameraFor, worldToScreen, type Camera } from './projection';
import { ARC, clamp, distance, sideAngle, targetFor, torpedoTargetFor, type Point, type Ship, type State, type Wreck } from './simulation';
import { createBackdrop } from './backdrop';

type Outline = readonly (readonly [number, number])[];
type HullKind = 'player' | 'frigate' | 'cruiser' | 'command';
interface ShipVisual { group: THREE.Group; exhaust: THREE.Group; scars: THREE.Group }

const CYAN = '#9ce8e8';
const GOLD = '#edc182';
const CORAL = '#f28f82';

// The 3D camera matches projection.ts exactly: looking from (1, 1, 1), at
// sqrt(1.5) pixels per world unit, gives x = .866(x-y), y = .5(x+y)-height.
// Picking, heading orders, the model silhouettes and annotations share that view.
export const createWorldRenderer = function (canvas: HTMLCanvasElement) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
	let pixelRatio = Math.min(window.devicePixelRatio, 1.25);
	renderer.setPixelRatio(pixelRatio);
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.15;
	const scene = new THREE.Scene();
	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 12000);
	const geometries = new Set<THREE.BufferGeometry>();
	const materials = new Set<THREE.Material>();
	const textures = new Set<THREE.Texture>();
	const ownGeometry = function <T extends THREE.BufferGeometry>(geometry: T): T { geometries.add(geometry); return geometry; };
	const ownMaterial = function <T extends THREE.Material>(material: T): T { materials.add(material); return material; };
	const ownTexture = function <T extends THREE.Texture>(texture: T): T { textures.add(texture); return texture; };
	const key = new THREE.DirectionalLight(0xd8eaff, 3.2); key.position.set(-400, 850, 280); scene.add(key);
	const rim = new THREE.DirectionalLight(0x578ebf, 2.4); rim.position.set(200, 200, -700); scene.add(rim);
	const warm = new THREE.DirectionalLight(0xe9a171, 0.75); warm.position.set(700, 100, 300); scene.add(warm);
	scene.add(new THREE.HemisphereLight(0xaccbe7, 0x0b101c, 1.2));

	const annotation = document.createElement('canvas');
	annotation.className = 'world-annotation';
	annotation.setAttribute('aria-hidden', 'true');
	annotation.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
	const ink = annotation.getContext('2d');
	if (!ink) { renderer.dispose(); throw new Error('Battlefield annotation canvas unavailable'); }
	canvas.insertAdjacentElement('afterend', annotation);
	const skyCanvas = document.createElement('canvas');
	const sky = skyCanvas.getContext('2d');
	let skyTexture = ownTexture(new THREE.CanvasTexture(skyCanvas));
	skyTexture.colorSpace = THREE.SRGBColorSpace;
	scene.background = skyTexture;
	const paintSky = createBackdrop();
	const glowCanvas = document.createElement('canvas'); glowCanvas.width = 64; glowCanvas.height = 64;
	const glowInk = glowCanvas.getContext('2d');
	if (glowInk) {
		const gradient = glowInk.createRadialGradient(32, 32, 0, 32, 32, 32);
		gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.16, '#ffffffd0'); gradient.addColorStop(0.42, '#ffffff38'); gradient.addColorStop(1, '#ffffff00');
		glowInk.fillStyle = gradient; glowInk.fillRect(0, 0, 64, 64);
	}
	const glowTexture = ownTexture(new THREE.CanvasTexture(glowCanvas));
	const armorCanvas = document.createElement('canvas'); armorCanvas.width = 256; armorCanvas.height = 256;
	const armorInk = armorCanvas.getContext('2d');
	if (armorInk) {
		armorInk.fillStyle = '#d9ddde'; armorInk.fillRect(0, 0, 256, 256);
		// Recessed seams and sparse service markings, sized in world units through
		// the extrusion UVs. The same map gives lit surfaces restrained weathering.
		for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
			const x = col * 85 + (row % 2) * 16 - 8; const y = row * 64;
			armorInk.fillStyle = (row + col) % 3 === 0 ? '#c5cdcf' : '#d7dcdd'; armorInk.fillRect(x + 2, y + 2, 81, 60);
			armorInk.strokeStyle = '#8a989b'; armorInk.lineWidth = 1.4; armorInk.strokeRect(x + 2, y + 2, 81, 60);
			armorInk.strokeStyle = '#edf0ed'; armorInk.lineWidth = 0.8; armorInk.beginPath(); armorInk.moveTo(x + 4, y + 61); armorInk.lineTo(x + 82, y + 61); armorInk.stroke();
			armorInk.fillStyle = '#a5b0b2';
			for (const xx of [x + 7, x + 77]) for (const yy of [y + 7, y + 56]) armorInk.fillRect(xx, yy, 1.8, 1.8);
			if ((row + col) % 2 === 0) {
				armorInk.fillStyle = '#69787b'; armorInk.fillRect(x + 15, y + 17, 18, 12);
				armorInk.fillStyle = '#a1adaf'; for (let i = 0; i < 4; i++) armorInk.fillRect(x + 17 + i * 4, y + 18, 2, 10);
			}
			armorInk.fillStyle = '#8e9b9d'; armorInk.fillRect(x + 57, y + 48, 13, 2); armorInk.fillRect(x + 57, y + 52, 8, 1);
		}
	}
	const armorTexture = ownTexture(new THREE.CanvasTexture(armorCanvas)); armorTexture.colorSpace = THREE.SRGBColorSpace;
	armorTexture.wrapS = THREE.RepeatWrapping; armorTexture.wrapT = THREE.RepeatWrapping; armorTexture.repeat.set(0.012, 0.012); armorTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
	const box = new THREE.BoxGeometry(1, 1, 1);
	const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
	const shapes = {
		spine: [[0.53, -0.08], [0.53, 0.08], [0.31, 0.18], [-0.43, 0.16], [-0.5, 0.08], [-0.5, -0.08], [-0.43, -0.16], [0.31, -0.18]],
		nacelle: [[0.29, 0.22], [0.13, 0.44], [-0.39, 0.49], [-0.51, 0.38], [-0.51, 0.23], [-0.27, 0.18]],
		prow: [[0.56, 0.1], [0.37, 0.28], [0.05, 0.27], [-0.02, 0.15], [0.36, 0.09]],
		wing: [[0.46, 0.05], [0.07, 0.47], [-0.43, 0.52], [-0.29, 0.22], [-0.43, 0.1]],
	} as const;
	const hullGeometry = function (outline: Outline, length: number, width: number, bottom: number, top: number) {
		const shape = new THREE.Shape();
		for (const [index, point] of outline.entries()) {
			if (index === 0) shape.moveTo(point[0] * length, -point[1] * width);
			else shape.lineTo(point[0] * length, -point[1] * width);
		}
		shape.closePath();
		const geometry = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: true, bevelSize: 1.7, bevelThickness: 1.5, bevelSegments: 1, steps: 1, curveSegments: 1 });
		geometry.rotateX(-Math.PI / 2); geometry.translate(0, bottom, 0);
		return geometry;
	};
	const makePrototype = function (kind: HullKind): THREE.Group {
		const player = kind === 'player'; const command = kind === 'command'; const heavy = kind !== 'frigate';
		const length = player ? 220 : heavy ? 170 : 115; const width = player ? 90 : heavy ? 58 : 42;
		const accent = player ? 0x80e7e8 : command ? 0xf2c681 : 0xe58a7c;
		const armor = ownMaterial(new THREE.MeshStandardMaterial({ color: player ? 0x526674 : command ? 0x736750 : 0x625864, map: armorTexture, metalness: 0.6, roughness: 0.5, flatShading: true }));
		const pale = ownMaterial(new THREE.MeshStandardMaterial({ color: player ? 0x96a9af : command ? 0xb7a58d : 0x9a8d95, map: armorTexture, metalness: 0.5, roughness: 0.47, flatShading: true }));
		const dark = ownMaterial(new THREE.MeshStandardMaterial({ color: 0x26313b, metalness: 0.6, roughness: 0.58 }));
		const gold = ownMaterial(new THREE.MeshStandardMaterial({ color: player ? 0xc5a879 : 0xb2856f, metalness: 0.65, roughness: 0.4 }));
		const lit = ownMaterial(new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.9, roughness: 0.4 }));
		const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
		const add = function (geometry: THREE.BufferGeometry, material: THREE.Material) {
			const bin = bins.get(material) ?? []; bin.push(geometry); bins.set(material, bin);
		};
		const block = function (x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material, rotation = 0) {
			const geometry = box.clone(); geometry.scale(sx, sy, sz); geometry.rotateY(rotation); geometry.translate(x, y, z); add(geometry.toNonIndexed(), material); geometry.dispose();
		};
		const tube = function (x: number, y: number, z: number, radius: number, height: number, material: THREE.Material, side = false) {
			const geometry = cylinder.clone(); geometry.scale(radius, height, radius); if (side) geometry.rotateX(Math.PI / 2); geometry.translate(x, y, z); add(geometry.toNonIndexed(), material); geometry.dispose();
		};
		add(hullGeometry(shapes.spine, length, width, 3, heavy ? 23 : 14), armor);
		for (const sign of [-1, 1]) {
			const mirror = function (outline: Outline): Outline { return outline.map(function ([x, z]) { return [x, z * sign] as const; }); };
			add(hullGeometry(mirror(heavy ? shapes.nacelle : shapes.wing), length, width, 7, heavy ? 26 : 19), armor);
			if (heavy) add(hullGeometry(mirror(shapes.prow), length, width, 22, 32), pale);
			// Overlapping armor leaves a real shadow line across the long prow.
			if (heavy) for (let i = 0; i < 3; i++) {
				const plate: Outline = [[0.075 + i * 0.11, 0.16], [0.16 + i * 0.11, 0.15], [0.18 + i * 0.11, 0.21], [0.08 + i * 0.11, 0.255]];
				add(hullGeometry(mirror(plate), length, width, 31, 33.2), i === 1 ? armor : pale);
			}
			block(-length * 0.31, 20, sign * width * 0.33, length * 0.24, 9, width * 0.2, dark);
			// Heat exchangers, recessed rail gun housings, and structural seams.
			for (let i = 0; i < 7; i++) block(-length * 0.42 + i * length * 0.026, 27, sign * width * 0.31, 2.5, 2, width * 0.15, gold);
			for (let i = 0; i < (player ? 6 : 4); i++) {
				const f = player ? 64 - i * 25 : length * (0.22 - i * 0.16);
				const size = player ? 13 : 9;
				tube(f, 27, sign * width * 0.36, size * 0.58, 4, dark);
				const housing = hullGeometry([[-0.5, -0.28], [-0.28, -0.5], [0.3, -0.5], [0.5, -0.25], [0.5, 0.3], [0.3, 0.5], [-0.3, 0.5], [-0.5, 0.3]], size, size, 29, 34);
				housing.translate(f, 0, sign * width * 0.36); add(housing, armor);
				for (const offset of [-2.1, 2.1]) {
					tube(f + offset, 32, sign * width * 0.47, 1.7, width * 0.19, pale, true);
					tube(f + offset, 32, sign * width * 0.54, 2.1, 3, dark, true);
				}
				block(f, 35.6, sign * width * 0.36, 3, 0.8, 3.5, gold);
				block(f - 4, 33, sign * width * 0.37, 1, 1, 3, lit);
			}
			for (let i = 0; i < 3; i++) block(length * (0.06 + i * 0.05), heavy ? 34 : 22, sign * width * 0.21, 4, 1, width * 0.08, gold, sign * 0.3);
			block(length * 0.4, 24, sign * width * 0.12, 16, 5, 5, dark);
			block(length * 0.46, 25, sign * width * 0.12, 3, 3, 3, lit);
			block(-length * 0.49, 18, sign * width * 0.32, 5, 14, width * 0.19, dark);
			block(-length * 0.515, 18, sign * width * 0.32, 1.8, 9, width * 0.13, lit);
			for (let i = 0; i < 4; i++) block(-length * 0.05 + i * length * 0.065, 30, sign * width * 0.1, 1.3, 2, width * 0.08, dark);
		}
		add(hullGeometry([[0.24, -0.06], [0.31, 0], [0.24, 0.06], [-0.32, 0.1], [-0.39, 0], [-0.32, -0.1]], length, width, heavy ? 23 : 16, heavy ? 39 : 28), pale);
		block(-length * 0.06, heavy ? 41 : 30, 0, length * 0.36, 1.2, 1.5, lit);
		if (heavy) {
			add(hullGeometry([[-0.09, -0.07], [-0.015, -0.08], [0.045, -0.04], [0.045, 0.04], [-0.015, 0.08], [-0.09, 0.07]], length, width, 39, 47), armor);
			block(length * 0.035, 45, 0, 1.5, 2.2, width * 0.07, lit);
			for (const sign of [-1, 1]) { block(-length * 0.015, 45, sign * width * 0.065, length * 0.05, 1.5, 1.2, lit); block(-length * 0.22, 40, sign * 8, length * 0.1, 2, 3, dark); }
		}
		block(-length * 0.26, heavy ? 36 : 26, 0, length * 0.08, 12, width * 0.18, dark);
		for (let i = 0; i < 4; i++) block(-length * 0.29 + i * 3, heavy ? 43 : 33, 0, 1, 2, width * 0.15, lit);
		if (command) {
			for (const sign of [-1, 1]) {
				block(-9, 33, sign * 27, 67, 6, 6, gold);
				block(-13, 45, sign * 13, 17, 25, 4, dark);
				block(-13, 59, sign * 13, 13, 2, 3, lit);
			}
		}
		const group = new THREE.Group();
		for (const [material, pieces] of bins) {
			const merged = ownGeometry(mergeGeometries(pieces));
			for (const piece of pieces) piece.dispose();
			group.add(new THREE.Mesh(merged, material));
		}
		const exhaust = new THREE.Group(); exhaust.name = 'exhaust'; group.add(exhaust);
		const flameMaterial = ownMaterial(new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
		const glowMaterial = ownMaterial(new THREE.SpriteMaterial({ map: glowTexture, color: accent, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
		for (const sign of [-1, 1]) {
			const nozzle = new THREE.Group(); nozzle.position.set(-length * 0.52, 18, sign * width * 0.32);
			const plume = new THREE.Mesh(ownGeometry(new THREE.ConeGeometry(7, 66, 16, 1, true)), flameMaterial); plume.rotation.z = Math.PI / 2; plume.position.x = -33;
			const glow = new THREE.Sprite(glowMaterial); glow.scale.set(47, 47, 1);
			const inner = new THREE.Sprite(glowMaterial); inner.position.x = -12; inner.scale.set(27, 18, 1);
			nozzle.add(plume, glow, inner); exhaust.add(nozzle);
		}
		const scars = new THREE.Group(); scars.name = 'scars'; group.add(scars);
		const scarMaterial = ownMaterial(new THREE.MeshStandardMaterial({ color: 0x11141a, roughness: 1, metalness: 0.1 }));
		const fireMaterial = ownMaterial(new THREE.MeshBasicMaterial({ color: 0xfb8b3b }));
		for (let i = 0; i < 6; i++) {
			const scar = new THREE.Group();
			const hole = new THREE.Mesh(ownGeometry(new THREE.DodecahedronGeometry(7 + i % 2 * 2, 0)), scarMaterial); hole.scale.set(1.5, 0.15, 0.7);
			hole.rotation.y = i * 1.8; scar.add(hole);
			const fire = new THREE.Mesh(ownGeometry(new THREE.TetrahedronGeometry(2, 0)), fireMaterial); fire.position.set(1, 0.8, -1); scar.add(fire);
			scar.position.set(length * (-0.25 + i % 3 * 0.18), heavy ? 29 : 22, (i < 3 ? -1 : 1) * width * 0.29); scars.add(scar);
		}
		return group;
	};
	const prototypes: Record<HullKind, THREE.Group> = { player: makePrototype('player'), frigate: makePrototype('frigate'), cruiser: makePrototype('cruiser'), command: makePrototype('command') };
	box.dispose(); cylinder.dispose();
	const instantiate = function (kind: HullKind): ShipVisual {
		const group = prototypes[kind].clone(true);
		const exhaust = group.getObjectByName('exhaust'); const scars = group.getObjectByName('scars');
		if (!(exhaust instanceof THREE.Group) || !(scars instanceof THREE.Group)) throw new Error('Incomplete cruiser model');
		scene.add(group); return { group, exhaust, scars };
	};
	const ships = new Map<number, ShipVisual>();
	const wrecks = new Map<Wreck, ShipVisual>();
	const shieldMaterial = ownMaterial(new THREE.MeshBasicMaterial({ color: 0x74dae7, transparent: true, opacity: 0.07, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false }));
	const shield = new THREE.Mesh(ownGeometry(new THREE.IcosahedronGeometry(1, 2)), shieldMaterial); shield.scale.set(155, 65, 94); scene.add(shield);
	const debris = new THREE.Group(); scene.add(debris);
	const debrisGeometry = ownGeometry(new THREE.DodecahedronGeometry(1, 0));
	const debrisMaterial = ownMaterial(new THREE.MeshStandardMaterial({ color: 0x26323c, roughness: 0.95, flatShading: true }));
	for (let i = 0; i < 24; i++) {
		const fragment = new THREE.Mesh(debrisGeometry, debrisMaterial);
		fragment.position.set(Math.sin(i * 7.2) * 2400, -100 - i % 3 * 30, Math.cos(i * 3.1) * 2400);
		fragment.scale.set(8 + i % 5 * 5, 4 + i % 3 * 6, 5 + i % 4 * 5); fragment.rotation.set(i * 0.7, i * 1.2, i * 2.1); debris.add(fragment);
	}
	let lastWidth = 0; let lastHeight = 0; let disposed = false;
	let lastState: State | undefined; let lastTime = -1; let lastBriefing = false; let lastZoom = 0;
	let lastHeading: number | undefined; let lastReduced = false; let lastFrameAt = 0;
	let frameAverage = 16.7; let slowFrames = 0; let economyResolution = false;
	const invalidate = function () { lastState = undefined; lastFrameAt = 0; };
	canvas.addEventListener('webglcontextrestored', invalidate);
	const line = function (a: Point, b: Point, color: string, width = 1) {
		ink.beginPath(); ink.moveTo(a.x, a.y); ink.lineTo(b.x, b.y); ink.strokeStyle = color; ink.lineWidth = width; ink.stroke();
	};
	const text = function (value: string, x: number, y: number, color: string, size = 12) {
		ink.font = `600 ${size}px "IBM Plex Mono", ui-monospace, monospace`; ink.textAlign = 'center'; ink.textBaseline = 'middle';
		ink.lineWidth = 4; ink.strokeStyle = '#060e19e0'; ink.strokeText(value, x, y); ink.fillStyle = color; ink.fillText(value, x, y);
	};
	const ring = function (at: Point, radius: number, color: string, width = 1) {
		ink.beginPath(); ink.ellipse(at.x, at.y, radius, radius / Math.sqrt(3), 0, 0, Math.PI * 2); ink.strokeStyle = color; ink.lineWidth = width; ink.stroke();
	};
	const chevron = function (at: Point, direction: number, color: string, size = 8) {
		ink.beginPath();
		for (const [index, offset] of [0, 2.5, -2.5].entries()) {
			const x = at.x + Math.cos(direction + offset) * size; const y = at.y + Math.sin(direction + offset) * size;
			if (index === 0) ink.moveTo(x, y); else ink.lineTo(x, y);
		}
		ink.closePath(); ink.fillStyle = color; ink.fill();
	};
	const updateShip = function (visual: ShipVisual, ship: Ship, state: State, reducedMotion: boolean) {
		visual.group.position.set(ship.x, 0, ship.y); visual.group.rotation.y = -ship.angle;
		const power = ship.id === 0 ? Math.abs(state.player.throttle) : 0.6;
		const pulse = reducedMotion ? 1 : 1 + Math.sin(state.time * 21 + ship.id) * 0.045;
		for (const nozzle of visual.exhaust.children) nozzle.scale.x = (0.35 + power * 0.8 + Math.hypot(ship.vx, ship.vy) / 120) * pulse;
		visual.exhaust.visible = ship.hp > 0;
		for (const [index, scar] of visual.scars.children.entries()) scar.visible = 1 - ship.hp / ship.maxHp > (index + 1) / 8;
	};
	const drawTactical = function (view: Camera, state: State, width: number, height: number, heading: number | undefined) {
		const p = state.player; const compact = width < 700; const font = compact ? 10 : 12;
		const center = worldToScreen(p, view, 20);
		// Short arc sectors explain the broadside orientation without filling the field.
		for (const side of ['port', 'starboard'] as const) {
			const target = targetFor(state, side); const ready = state.batteries[side].reload === 0 && !p.braced;
			const bearing = sideAngle(p, side); const radius = 215;
			ink.beginPath();
			for (let i = 0; i <= 24; i++) {
				const angle = bearing - ARC + ARC * 2 * i / 24;
				const at = worldToScreen({ x: p.x + Math.cos(angle) * radius, y: p.y + Math.sin(angle) * radius }, view);
				if (i === 0) ink.moveTo(at.x, at.y); else ink.lineTo(at.x, at.y);
			}
			ink.strokeStyle = ready && target ? '#efc4818c' : '#82bac126'; ink.lineWidth = ready && target ? 2 : 1; ink.stroke();
			if (target) {
				const at = worldToScreen(target, view);
				ring(at, target.length * view.scale * 0.66, ready ? '#edc182b0' : '#90bac147', ready ? 1.5 : 1);
			}
		}
		for (let i = 1; i <= 10; i++) {
			const at = worldToScreen({ x: p.x + p.vx * i * 0.5, y: p.y + p.vy * i * 0.5 }, view);
			ink.fillStyle = '#99dfde55'; ink.fillRect(at.x - 1, at.y - 1, 2, 2);
		}
		const torpedoTarget = torpedoTargetFor(state);
		for (const enemy of state.enemies) {
			const at = worldToScreen(enemy, view, 66); const hull = worldToScreen(enemy, view, 20);
			const selected = enemy.id === state.priorityTarget;
			const color = selected || enemy.command ? GOLD : '#d8a69e';
			const safeTop = height < 500 ? 95 : compact ? 155 : 145;
			const safeBottom = height - (height < 500 ? 170 : compact ? 335 : 245);
			const behindLeftPanel = !compact && hull.x < 250 && hull.y < 335;
			const behindRightPanel = !compact && hull.x > width - 270 && hull.y < 285;
			const onScreen = hull.x > 55 && hull.x < width - 55 && at.y > safeTop && hull.y < safeBottom && !behindLeftPanel && !behindRightPanel;
			if (onScreen) {
				const name = enemy.command ? 'COMMAND' : enemy.kind === 'cruiser' ? 'CRUISER' : 'FRIGATE';
				text(`${selected ? '◆ ' : ''}${name} ${String(enemy.id).padStart(2, '0')}`, at.x, at.y - 8, color, font);
				line({ x: at.x - 26, y: at.y + 6 }, { x: at.x + 26, y: at.y + 6 }, '#49343a', 3);
				line({ x: at.x - 26, y: at.y + 6 }, { x: at.x - 26 + 52 * enemy.hp / enemy.maxHp, y: at.y + 6 }, selected ? GOLD : CORAL, 3);
				if (selected && enemy.tactic) text(`${enemy.weapon === 'beam' ? 'LANCE / ' : enemy.weapon === 'missile' ? 'MISSILES / ' : ''}${enemy.tactic.toUpperCase()}`, at.x, at.y - 25, '#b2c4cd', font - 1);
				if (selected) {
					const r = Math.max(20, enemy.length * view.scale * 0.65);
					for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
						line({ x: hull.x + sx * r, y: hull.y + sy * r * 0.6 }, { x: hull.x + sx * (r - 9), y: hull.y + sy * r * 0.6 }, GOLD, 1.5);
						line({ x: hull.x + sx * r, y: hull.y + sy * r * 0.6 }, { x: hull.x + sx * r, y: hull.y + sy * (r * 0.6 - 9) }, GOLD, 1.5);
					}
				}
				if (enemy === torpedoTarget && state.torpedoes.reload === 0 && !p.braced) text('BOW LOCK', hull.x, hull.y + enemy.length * view.scale * 0.45 + 13, GOLD, font - 1);
			} else {
				const dx = hull.x - center.x; const dy = hull.y - center.y;
				const top = safeTop; const bottom = Math.max(top + 30, safeBottom);
				const horizontal = (width / 2 - 45) / Math.max(1, Math.abs(dx));
				const vertical = (dy < 0 ? center.y - top : bottom - center.y) / Math.max(1, Math.abs(dy));
				const fraction = Math.max(0.08, Math.min(1, horizontal, vertical));
				const edge = { x: clamp(center.x + dx * fraction, compact ? 40 : 265, width - (compact ? 40 : 275)), y: clamp(center.y + dy * fraction, top, bottom) };
				chevron(edge, Math.atan2(dy, dx), enemy.warning > 0 ? '#ffca86' : CORAL);
				text(`${Math.round(distance(p, enemy))} m`, edge.x, edge.y + 19, color, font - 1);
			}
			if (enemy.warning > 0) {
				const aim = worldToScreen(enemy.aim, view, 5); const origin = worldToScreen(enemy, view, 25);
				const beam = enemy.weapon === 'beam';
				ink.setLineDash(beam ? [12, 5] : [5, 9]); line(origin, aim, beam ? '#d8a5ff9c' : '#ed867d6b', beam ? 2 : 1.5); ink.setLineDash([]);
				ring(aim, (30 + enemy.warning * 24) * view.scale, beam ? '#dda6ffce' : '#ffac8cc9', 1.5);
				text(beam ? 'LANCE CHARGING' : enemy.weapon === 'missile' ? 'MISSILE SALVO' : 'VOLLEY', aim.x, aim.y + 29 * view.scale, beam ? '#e8c8ff' : '#ffc8a7', font - 1);
			}
		}
		if (heading !== undefined) {
			const world = { x: p.x + Math.cos(heading) * 290, y: p.y + Math.sin(heading) * 290 };
			const at = worldToScreen(world, view, 20);
			ink.setLineDash([4, 7]); line(center, at, '#9ce8e894'); ink.setLineDash([]);
			chevron(at, Math.atan2(at.y - center.y, at.x - center.x), CYAN, 7);
		}
		if (p.braced || state.shield.active > 0) text(state.shield.active > 0 ? 'AEGIS ACTIVE' : 'ARMOR LOCK', center.x, center.y + 62 * view.scale, state.shield.active > 0 ? CYAN : GOLD, font);
		if (width > 1050 && height > 800) {
			const x = width - 92; const y = 365; const radius = 53;
			ink.fillStyle = '#07121c9c'; ink.beginPath(); ink.arc(x, y, radius + 9, 0, Math.PI * 2); ink.fill();
			for (const r of [26, 53]) { ink.beginPath(); ink.arc(x, y, r, 0, Math.PI * 2); ink.strokeStyle = '#7897a43b'; ink.lineWidth = 1; ink.stroke(); }
			line({ x: x - radius, y }, { x: x + radius, y }, '#7897a423'); line({ x, y: y - radius }, { x, y: y + radius }, '#7897a423');
			chevron({ x, y }, p.angle, CYAN, 5);
			for (const enemy of state.enemies) {
				const dx = (enemy.x - p.x) / 18; const dy = (enemy.y - p.y) / 18; const factor = Math.min(1, radius / Math.max(1, Math.hypot(dx, dy)));
				ink.fillStyle = enemy.id === state.priorityTarget ? GOLD : CORAL; ink.fillRect(x + dx * factor - 2, y + dy * factor - 2, 4, 4);
			}
			text('TACTICAL · 950 m', x, y + 76, '#8ea5b3', 10);
		}
	};
	const drawOrdnance = function (view: Camera, state: State, reducedMotion: boolean) {
		for (const beam of state.beams) {
			const from = worldToScreen(beam.from, view, 22); const to = worldToScreen(beam.to, view, 22);
			ink.globalAlpha = Math.min(1, beam.life / 0.03);
			line(from, to, beam.hostile ? '#fb72942a' : '#73e8ff23', reducedMotion ? 8 : 14);
			line(from, to, beam.hostile ? '#ef8abbbb' : '#83e9f8aa', 5);
			line(from, to, beam.hostile ? '#ffe2eb' : '#efffff', 1.8);
			ink.globalAlpha = 1;
		}
		for (const shell of state.shells) {
			const at = worldToScreen(shell, view, 22);
			const missile = shell.projectile === 'missile'; const duration = missile ? 0.35 : shell.guidance ? 0.24 : 0.075;
			const tail = worldToScreen({ x: shell.x - shell.vx * duration, y: shell.y - shell.vy * duration }, view, 22);
			const color = shell.hostile ? '#ff8b87' : missile ? '#dbe9c5' : shell.guidance ? '#ffbf72' : '#ffe2a0';
			line(tail, at, shell.hostile ? '#fb797329' : '#e5c38c28', missile ? 4 : shell.guidance ? 9 : 6);
			if (missile) ink.setLineDash([2, 3]);
			line(tail, at, color, missile ? 1.4 : shell.guidance ? 2.7 : 1.7); ink.setLineDash([]);
			ink.fillStyle = '#fff5dc'; ink.beginPath(); ink.arc(at.x, at.y, missile ? 2 : shell.guidance ? 2.7 : 1.7, 0, Math.PI * 2); ink.fill();
		}
		for (const trace of state.pointDefense.traces) {
			ink.globalAlpha = trace.life / 0.16;
			line(worldToScreen(trace.from, view, 28), worldToScreen(trace.to, view, 22), '#d5f5ee', 1.5);
			ink.globalAlpha = 1;
		}
		for (const effect of state.effects) {
			const progress = 1 - effect.life / effect.duration; const at = worldToScreen(effect, view, 24);
			const explosion = effect.kind === 'explosion'; const r = (explosion ? 110 : effect.kind === 'impact' ? 26 : 18) * view.scale;
			const radius = Math.max(1, r * (0.25 + progress * (explosion ? 1.2 : 0.7)));
			const blue = effect.kind === 'shield';
			const glow = ink.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
			glow.addColorStop(0, blue ? '#e2ffff' : '#fff4c3'); glow.addColorStop(0.18, blue ? '#8be5efcc' : '#f5b866d0'); glow.addColorStop(0.5, blue ? '#4bbce454' : '#dc5e2c65'); glow.addColorStop(1, '#00000000');
			ink.globalAlpha = reducedMotion ? Math.min(0.5, 1 - progress) : 1 - progress;
			ink.fillStyle = glow; ink.fillRect(at.x - radius, at.y - radius, radius * 2, radius * 2);
			if (explosion) ring(at, r * (0.3 + progress * 2.2), '#f5c797a0', 1.6);
			for (let i = 0; i < (explosion ? 13 : 5); i++) {
				const angle = i * 2.399; const spread = r * progress * (0.8 + i % 4 * 0.4);
				line({ x: at.x + Math.cos(angle) * spread * 0.55, y: at.y + Math.sin(angle) * spread * 0.55 }, { x: at.x + Math.cos(angle) * spread, y: at.y + Math.sin(angle) * spread }, blue ? '#aff5fb' : '#efbd83', 1.4);
			}
			ink.globalAlpha = 1;
		}
	};
	return {
		render: function (width: number, height: number, state: State, reducedMotion: boolean, briefing = false, zoom = 1, heading?: number) {
			if (disposed || width <= 0 || height <= 0) return;
			const resized = width !== lastWidth || height !== lastHeight;
			// Briefing, pause, and refit scenes are static: retain their last frame
			// instead of spending GPU time redrawing an identical ship behind menus.
			if (!resized && state === lastState && state.time === lastTime && briefing === lastBriefing && zoom === lastZoom && heading === lastHeading && reducedMotion === lastReduced) { lastFrameAt = 0; return; }
			const now = performance.now();
			if (lastFrameAt > 0 && !briefing) {
				frameAverage = frameAverage * 0.95 + Math.min(200, now - lastFrameAt) * 0.05;
				slowFrames = frameAverage > 35 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
				if (slowFrames > 45) economyResolution = true;
			}
			lastFrameAt = now;
			const nextPixelRatio = Math.min(window.devicePixelRatio, briefing ? 1.75 : economyResolution ? 1 : 1.25);
			if (pixelRatio !== nextPixelRatio) { pixelRatio = nextPixelRatio; renderer.setPixelRatio(pixelRatio); }
			lastState = state; lastTime = state.time; lastBriefing = briefing; lastZoom = zoom; lastHeading = heading; lastReduced = reducedMotion;
			const view = cameraFor(width, height, state.player, zoom);
			if (resized) {
				lastWidth = width; lastHeight = height; renderer.setSize(width, height, false);
				const dpr = Math.min(window.devicePixelRatio, 2); annotation.width = Math.round(width * dpr); annotation.height = Math.round(height * dpr); ink.setTransform(dpr, 0, 0, dpr, 0, 0);
				skyCanvas.width = Math.round(width); skyCanvas.height = Math.round(height);
				if (sky) {
					paintSky(sky, width, height, view);
					// GPU textures cannot change their storage dimensions after upload.
					// Replace rather than resize one, including after fullscreen changes.
					textures.delete(skyTexture); skyTexture.dispose();
					skyTexture = ownTexture(new THREE.CanvasTexture(skyCanvas)); skyTexture.colorSpace = THREE.SRGBColorSpace;
					scene.background = skyTexture;
				}
			}
			ink.clearRect(0, 0, width, height);
			const hero = briefing && width > 850;
			const scale = hero ? Math.min(width / 500, height / 300, 3.4) : view.scale;
			const pixelsPerWorld = scale * Math.sqrt(1.5);
			const focusX = hero ? 0.74 : 0.5; const focusY = hero ? 0.49 : 0.45;
			camera.left = -width * focusX / pixelsPerWorld; camera.right = width * (1 - focusX) / pixelsPerWorld;
			camera.top = height * focusY / pixelsPerWorld; camera.bottom = -height * (1 - focusY) / pixelsPerWorld;
			camera.updateProjectionMatrix();
			const shake = reducedMotion || briefing ? 0 : state.shake * 0.45;
			const px = state.player.x + Math.sin(state.time * 83) * shake; const py = state.player.y + Math.cos(state.time * 71) * shake;
			camera.position.set(px + 2000, 2000, py + 2000); camera.lookAt(px, 0, py);
			const live = new Set<number>();
			for (const ship of [state.player, ...state.enemies]) {
				live.add(ship.id);
				let visual = ships.get(ship.id);
				if (!visual) {
					const enemy = state.enemies.find(function (item) { return item.id === ship.id; });
					visual = instantiate(ship.id === 0 ? 'player' : enemy?.command ? 'command' : ship.length > 150 ? 'cruiser' : 'frigate'); ships.set(ship.id, visual);
				}
				updateShip(visual, ship, state, reducedMotion); visual.group.visible = !briefing || ship.id === 0;
			}
			for (const [id, visual] of ships) if (!live.has(id)) { scene.remove(visual.group); ships.delete(id); }
			for (const wreck of state.wrecks) {
				let visual = wrecks.get(wreck);
				if (!visual) { visual = instantiate(wreck.length > 150 ? 'cruiser' : 'frigate'); wrecks.set(wreck, visual); }
				visual.group.position.set(wreck.x, -12 - (35 - wreck.life) * 1.5, wreck.y); visual.group.rotation.set((35 - wreck.life) * 0.013, -wreck.angle, -0.08);
				visual.group.scale.setScalar(Math.min(1, wreck.life / 6)); visual.group.visible = !briefing; visual.exhaust.visible = false;
				for (const scar of visual.scars.children) scar.visible = true;
			}
			for (const [wreck, visual] of wrecks) if (!state.wrecks.includes(wreck)) { scene.remove(visual.group); wrecks.delete(wreck); }
			shield.visible = !briefing && state.shield.active > 0;
			shield.position.set(state.player.x, 24, state.player.y); shield.rotation.y = -state.player.angle;
			shieldMaterial.opacity = reducedMotion ? 0.13 : 0.09 + Math.sin(state.time * 6) * 0.025;
			debris.visible = !briefing;
			renderer.render(scene, camera);
			if (briefing) return;
			drawTactical(view, state, width, height, heading); drawOrdnance(view, state, reducedMotion);
		},
		dispose: function () {
			if (disposed) return; disposed = true;
			canvas.removeEventListener('webglcontextrestored', invalidate);
			annotation.remove(); scene.clear(); ships.clear(); wrecks.clear();
			for (const geometry of geometries) geometry.dispose();
			for (const material of materials) material.dispose();
			for (const texture of textures) texture.dispose();
			renderer.dispose(); renderer.forceContextLoss();
		},
	};
};
