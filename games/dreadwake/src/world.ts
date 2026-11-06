import { createDriveAnimator, shieldEnvelope } from './effect-motion';
import * as THREE from 'three';
import { createShipModels, type HullKind } from './ship-model';
import { hudObstacles, clearLabelPosition, type LabelObstacle } from './tactical-labels';
import { CEL } from './visual-theme';
import { createCombatEffectsRenderer } from './combat-effects';
import { cameraFor, worldToScreen, type Camera } from './projection';
import { ARC, clamp, distance, sideAngle, targetFor, torpedoTargetFor, type Point, type Ship, type State, type Wreck } from './simulation';
import { createBackdrop } from './backdrop';
import { MOUNT_SOCKETS, type WeaponId } from './weapons';

interface SocketVisual { group: THREE.Group; weapon: WeaponId | undefined }
interface ShipVisual { group: THREE.Group; exhaust: THREE.Group; scars: THREE.Group; sockets: Map<number, SocketVisual> }

const CYAN = CEL.mint;
const GOLD = CEL.amber;
const CORAL = CEL.hostile;

// The 3D camera matches projection.ts exactly: looking from (1, 1, 1), at
// sqrt(1.5) pixels per world unit, gives x = .866(x-y), y = .5(x+y)-height.
// Picking, heading orders, the model silhouettes and annotations share that view.
export const createWorldRenderer = function (canvas: HTMLCanvasElement) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
	let pixelRatio = Math.min(Math.max(window.devicePixelRatio, 1.25), 1.5);
	renderer.setPixelRatio(pixelRatio);
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.NoToneMapping;
	const scene = new THREE.Scene();
	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 12000);
	const geometries = new Set<THREE.BufferGeometry>();
	const materials = new Set<THREE.Material>();
	const textures = new Set<THREE.Texture>();
	const ownGeometry = function <T extends THREE.BufferGeometry>(geometry: T): T { geometries.add(geometry); return geometry; };
	const ownMaterial = function <T extends THREE.Material>(material: T): T { materials.add(material); return material; };
	const ownTexture = function <T extends THREE.Texture>(texture: T): T { textures.add(texture); return texture; };

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
	const drawCombatEffects = createCombatEffectsRenderer();
	const driveLength = createDriveAnimator();
	const models = createShipModels();
	const prototypes = models.prototypes;
	const instantiate = function (kind: HullKind): ShipVisual {
		const group = prototypes[kind].clone(true);
		const exhaust = group.getObjectByName('exhaust'); const scars = group.getObjectByName('scars');
		if (!(exhaust instanceof THREE.Group) || !(scars instanceof THREE.Group)) throw new Error('Incomplete cruiser model');
		const sockets = new Map<number, SocketVisual>();
		if (kind === 'player') for (const socket of MOUNT_SOCKETS) {
			const mount = group.getObjectByName(`mount-${socket.index}`);
			if (!(mount instanceof THREE.Group)) throw new Error('Incomplete turret socket');
			sockets.set(socket.index, { group: mount, weapon: undefined });
		}
		scene.add(group); return { group, exhaust, scars, sockets };
	};
	const ships = new Map<number, ShipVisual>();
	const wrecks = new Map<Wreck, ShipVisual>();
	const shieldMaterial = ownMaterial(new THREE.MeshBasicMaterial({ color: CEL.mint, transparent: true, opacity: 0.05, depthWrite: false }));
	const shield = new THREE.Mesh(ownGeometry(new THREE.SphereGeometry(1, 40, 24)), shieldMaterial); shield.scale.set(155, 65, 94); scene.add(shield);
	const debris = new THREE.Group(); scene.add(debris);
	const debrisGeometry = ownGeometry(new THREE.DodecahedronGeometry(1, 0));
	const debrisMaterial = ownMaterial(new THREE.MeshBasicMaterial({ color: CEL.planet }));
	const debrisEdges = ownGeometry(new THREE.EdgesGeometry(debrisGeometry));
	const debrisInk = ownMaterial(new THREE.LineBasicMaterial({ color: CEL.ink }));
	for (let i = 0; i < 24; i++) {
		const fragment = new THREE.Mesh(debrisGeometry, debrisMaterial);
		fragment.position.set(Math.sin(i * 7.2) * 2400, -100 - i % 3 * 30, Math.cos(i * 3.1) * 2400);
		fragment.scale.set(8 + i % 5 * 5, 4 + i % 3 * 6, 5 + i % 4 * 5); fragment.rotation.set(i * 0.7, i * 1.2, i * 2.1); const edge = new THREE.LineSegments(debrisEdges, debrisInk); fragment.add(edge); debris.add(fragment);
	}
	let lastWidth = 0; let lastHeight = 0; let disposed = false;
	let lastState: State | undefined; let lastTime = -1; let lastBriefing = false; let lastZoom = 0;
	let lastHeading: number | undefined; let lastReduced = false; let lastFrameAt = 0;
	let lastFit = '';
	let frameAverage = 16.7; let slowFrames = 0; let economyResolution = false;
	const invalidate = function () { lastState = undefined; lastFrameAt = 0; };
	canvas.addEventListener('webglcontextrestored', invalidate);
	const line = function (a: Point, b: Point, color: string, width = 1) {
		ink.beginPath(); ink.moveTo(a.x, a.y); ink.lineTo(b.x, b.y); ink.strokeStyle = color; ink.lineWidth = width; ink.stroke();
	};
	let occupied: LabelObstacle[] = [];
	const text = function (value: string, x: number, y: number, color: string, size = 12) {
		ink.font = `600 ${size}px "IBM Plex Mono", ui-monospace, monospace`; ink.textAlign = 'center'; ink.textBaseline = 'middle';
		const bounds = ink.measureText(value);
		const at = clearLabelPosition({ x, y }, bounds.width + 10, size + 6, occupied, lastWidth, lastHeight); if (!at) return;
		x = at.x; y = at.y; occupied.push({left:x-bounds.width/2-7,right:x+bounds.width/2+7,top:y-size/2-5,bottom:y+size/2+5});
		ink.fillStyle = CEL.hud; ink.fillRect(x - bounds.width / 2 - 5, y - size / 2 - 3, bounds.width + 10, size + 6); ink.fillStyle = color; ink.fillText(value, x, y);
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
		for (const nozzle of visual.exhaust.children) for (const plume of nozzle.children) {
			plume.scale.x = driveLength(ship, state, reducedMotion) * (plume.name === 'core' ? 0.62 : 1);
		}
		visual.exhaust.visible = ship.hp > 0;
		for (const [index, scar] of visual.scars.children.entries()) scar.visible = 1 - ship.hp / ship.maxHp > (index + 1) / 8;
		if (ship.id === 0) for (const socket of MOUNT_SOCKETS) {
			const slot = visual.sockets.get(socket.index); if (!slot) continue;
			const mount = state.arsenal?.mounts[socket.index];
			const weapon = state.arsenal ? mount?.weapon : 'rail';
			if (slot.weapon !== weapon) {
				slot.group.clear(); slot.weapon = weapon;
				const prototype = weapon ? models.turretPrototypes.get(weapon) : undefined;
				if (prototype) slot.group.add(prototype.clone(true));
			}
			const direction = mount ? mount.locked ? mount.lockHeading : mount.heading : sideAngle(ship, socket.side);
			slot.group.rotation.y = -(direction - ship.angle);
			const recoil = reducedMotion ? 0 : Math.min(2.4, (mount?.flash ?? 0) * 15);
			for (const fitted of slot.group.children) fitted.position.x = -recoil;
		}
	};
	const drawTactical = function (view: Camera, state: State, width: number, height: number, heading: number | undefined) {
		occupied = hudObstacles(canvas);
		const p = state.player; const compact = width < 700; const font = compact ? 10 : 12;
		const center = worldToScreen(p, view, 20);
		// Short arc sectors explain the broadside orientation without filling the field.
		for (const side of state.arsenal ? [] : ['port', 'starboard'] as const) {
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
		if (state.arsenal) for (const side of ['port', 'starboard'] as const) {
			const hasGuns = MOUNT_SOCKETS.some(function (socket) { const mount = state.arsenal?.mounts[socket.index]; return socket.side === side && mount && mount.weapon !== 'seeker'; });
			if (!hasGuns) continue;
			const bearing = sideAngle(p, side); const radius = 165;
			ink.beginPath();
			for (let i = 0; i <= 32; i++) {
				const angle = bearing - Math.PI / 2 + Math.PI * i / 32;
				const at = worldToScreen({ x: p.x + Math.cos(angle) * radius, y: p.y + Math.sin(angle) * radius }, view);
				if (i === 0) ink.moveTo(at.x, at.y); else ink.lineTo(at.x, at.y);
			}
			ink.strokeStyle = state.fireControl.automatic && !p.braced ? `${CEL.mint}35` : `${CEL.muted}25`; ink.lineWidth = 1; ink.stroke();
		}
		for (let i = 1; i <= 10; i++) {
			const at = worldToScreen({ x: p.x + p.vx * i * 0.5, y: p.y + p.vy * i * 0.5 }, view);
			ink.fillStyle = '#99dfde55'; ink.fillRect(at.x - 1, at.y - 1, 2, 2);
		}
		const torpedoTarget = state.arsenal ? undefined : torpedoTargetFor(state);
		for (const enemy of state.enemies) {
			const hull = worldToScreen(enemy, view, 20);
			const at = { x: hull.x, y: hull.y - (enemy.length * 0.38 + 33) * view.scale - 18 };
			const selected = state.arsenal ? state.arsenal.mounts.some(function (mount) { return mount?.target === enemy.id; }) : enemy.id === state.priorityTarget;
			const color = selected || enemy.command ? GOLD : '#d8a69e';
			const safeTop = height < 500 ? 80 : compact ? 180 : 145;
			const safeBottom = height - (state.arsenal ? height < 500 ? 120 : compact ? 250 : 180 : height < 500 ? 170 : compact ? 335 : 245);
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
				ink.setLineDash(beam ? [12, 5] : [5, 9]); line(origin, aim, beam ? CEL.violet : '#ed867d6b', beam ? 2 : 1.5); ink.setLineDash([]);
				ring(aim, (30 + enemy.warning * 24) * view.scale, beam ? CEL.violet : '#ffac8cc9', 1.5);
				text(beam ? 'LANCE CHARGING' : enemy.weapon === 'missile' ? 'MISSILE SALVO' : 'VOLLEY', aim.x, aim.y + (p.length * 0.4 + 42) * view.scale, beam ? CEL.violet : '#ffc8a7', font - 1);
			}
		}
		if (heading !== undefined) {
			const world = { x: p.x + Math.cos(heading) * 290, y: p.y + Math.sin(heading) * 290 };
			const at = worldToScreen(world, view, 20);
			ink.setLineDash([4, 7]); line(center, at, '#9ce8e894'); ink.setLineDash([]);
			chevron(at, Math.atan2(at.y - center.y, at.x - center.x), CYAN, 7);
		}

		if (p.braced || state.shield.active > 0) text(state.shield.active > 0 ? 'AEGIS ACTIVE' : 'ARMOR LOCK', center.x, center.y + (p.length * 0.4 + 34) * view.scale, state.shield.active > 0 ? CYAN : GOLD, font);
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

	return {
		render: function (width: number, height: number, state: State, reducedMotion: boolean, briefing = false, zoom = 1, heading?: number) {
			if (disposed || width <= 0 || height <= 0) return;
			const resized = width !== lastWidth || height !== lastHeight;
			// Briefing, pause, and refit scenes are static: retain their last frame
			// instead of spending GPU time redrawing an identical ship behind menus.
			const fit = state.arsenal ? `${state.fireControl.automatic}/${state.player.braced}/${state.player.hp}/${state.arsenal.mounts.map(function (mount) { return mount ? `${mount.weapon}:${mount.rank}` : '-'; }).join(',')}` : 'legacy';
			if (!resized && state === lastState && state.time === lastTime && briefing === lastBriefing && zoom === lastZoom && heading === lastHeading && reducedMotion === lastReduced && fit === lastFit) { lastFrameAt = 0; return; }
			const now = performance.now();
			if (lastFrameAt > 0 && !briefing) {
				frameAverage = frameAverage * 0.95 + Math.min(200, now - lastFrameAt) * 0.05;
				slowFrames = frameAverage > 35 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
				if (slowFrames > 45) economyResolution = true;
			}
			lastFrameAt = now;
			const nextPixelRatio = Math.min(Math.max(window.devicePixelRatio, 1.25), briefing ? 1.75 : economyResolution ? 1 : 1.5);
			if (pixelRatio !== nextPixelRatio) { pixelRatio = nextPixelRatio; renderer.setPixelRatio(pixelRatio); }
			lastState = state; lastTime = state.time; lastBriefing = briefing; lastZoom = zoom; lastHeading = heading; lastReduced = reducedMotion; lastFit = fit;
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
			shieldMaterial.opacity = 0.07 * shieldEnvelope(state.shield.active);
			debris.visible = !briefing;
			renderer.render(scene, camera);
			if (briefing) return;
			const effectsView = cameraFor(width, height, { x: px, y: py }, zoom);
			drawCombatEffects(ink, effectsView, state, reducedMotion); drawTactical(effectsView, state, width, height, heading);
		},
		dispose: function () {
			if (disposed) return; disposed = true;
			canvas.removeEventListener('webglcontextrestored', invalidate);
			annotation.remove(); scene.clear(); ships.clear(); wrecks.clear();
			for (const geometry of geometries) geometry.dispose();
			for (const material of materials) material.dispose();
			for (const texture of textures) texture.dispose();
			models.dispose(); renderer.dispose(); renderer.forceContextLoss();
		},
	};
};
