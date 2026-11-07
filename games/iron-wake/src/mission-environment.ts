import { BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, Group, InstancedMesh, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, RingGeometry, SRGBColorSpace, Texture } from 'three';
import type { Biome, MissionMap, MissionRuntime } from './campaign-types';
import { EXTRACTION_RADIUS, EXTRACTION_SECONDS } from './missions';

interface SurfacePalette { ground: string; dust: string; rock: string; road: string; sky: string; haze: string; light: string }
export const SURFACE_PALETTES: Readonly<Record<Biome, SurfacePalette>> = {
	badlands: { ground: '#645548', dust: '#97816a', rock: '#574c43', road: '#49433c', sky: '#342d29', haze: '#756354', light: '#ffe0af' },
	volcanic: { ground: '#373c42', dust: '#60636a', rock: '#252d34', road: '#252d32', sky: '#242833', haze: '#4c4c59', light: '#ffd6c2' },
	tundra: { ground: '#a3b6b8', dust: '#d6e0d9', rock: '#617b81', road: '#758c8f', sky: '#30444c', haze: '#8aa9af', light: '#e1f5ff' },
};

// Each contract owns one terrain bundle. Traversable relief stays below the
// mech's ankles; tall silhouettes belong outside the playable boundary.
export const createMissionEnvironment = function (map: MissionMap) {
	const palette = SURFACE_PALETTES[map.biome];
	const root = new Group(); root.name = 'mission-terrain';
	const geometries = new Set<BufferGeometry>(); const materials = new Set<Material>(); const textures = new Set<Texture>();
	const batches: InstancedMesh[] = [];
	const geometry = function <T extends BufferGeometry>(value: T) { geometries.add(value); return value; };
	const material = function <T extends Material>(value: T) { materials.add(value); return value; };
	const cube = geometry(new BoxGeometry(1, 1, 1)); const rockShape = geometry(new CylinderGeometry(0.65, 1, 1, 5));
	const steel = material(new MeshStandardMaterial({ color: '#879494', roughness: 0.85, metalness: 0.16 }));
	const dark = material(new MeshStandardMaterial({ color: '#28383c', roughness: 0.95 }));
	const paint = material(new MeshBasicMaterial({ color: '#b4c8ba' }));
	const orange = material(new MeshBasicMaterial({ color: '#ffb070' }));
	const green = material(new MeshBasicMaterial({ color: '#b9f5ca' }));
	let seed = map.seed;
	const random = function () { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
	const box = function (parent: Group, surface: Material, x: number, y: number, z: number, width: number, height: number, depth: number) {
		const mesh = new Mesh(cube, surface); mesh.position.set(x, y + height / 2, z); mesh.scale.set(width, height, depth); mesh.castShadow = height > 10; mesh.receiveShadow = true; parent.add(mesh); return mesh;
	};
	const groundSurface = material(new MeshStandardMaterial({ color: palette.ground, roughness: 1, metalness: 0 }));
	if (typeof document !== 'undefined') {
		const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = Math.round(2048 * map.height / map.width);
		const ctx = canvas.getContext('2d');
		if (ctx) {
			ctx.scale(canvas.width / map.width, canvas.height / map.height);
			ctx.fillStyle = palette.ground; ctx.fillRect(0, 0, map.width, map.height);
			for (let i = 0; i < 260; i++) {
				const x = random() * map.width; const y = random() * map.height; const radius = 40 + random() * 240;
				ctx.globalAlpha = 0.05 + random() * 0.12; ctx.fillStyle = i % 3 ? palette.dust : palette.rock;
				ctx.beginPath(); ctx.ellipse(x, y, radius * 1.6, radius, random() * Math.PI, 0, Math.PI * 2); ctx.fill();
			}
			ctx.globalAlpha = 1;
			// Tracks connect the generated combat sites, so each field has a
			// readable travel network instead of a scaled-up empty apron.
			const route = [map.drop, ...map.sites, map.objective, map.extraction];
			ctx.lineJoin = 'round'; ctx.lineCap = 'round';
			for (const [width, opacity] of [[108, 0.3], [80, 0.28], [52, 0.16]]) {
				ctx.strokeStyle = palette.road; ctx.lineWidth = width ?? 1; ctx.globalAlpha = opacity ?? 1; ctx.beginPath();
				for (const [index, point] of route.entries()) { if (index === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); }
				ctx.stroke();
			}
			ctx.globalAlpha = 1;
			for (const landmark of map.landmarks) {
				ctx.save(); ctx.translate(landmark.x, landmark.y); ctx.rotate(landmark.rotation);
				if (landmark.kind === 'depot') {
					const radius = landmark.radius;
					ctx.fillStyle = palette.road; ctx.globalAlpha = 0.7; ctx.fillRect(-radius, -radius * 0.6, radius * 2, radius * 1.2);
					ctx.strokeStyle = palette.dust; ctx.lineWidth = 3; ctx.strokeRect(-radius + 8, -radius * 0.6 + 8, radius * 2 - 16, radius * 1.2 - 16);
					ctx.setLineDash([12, 12]); ctx.beginPath(); ctx.moveTo(-radius, 0); ctx.lineTo(radius, 0); ctx.stroke();
				} else {
					const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, landmark.radius);
					halo.addColorStop(0, palette.road); halo.addColorStop(0.7, palette.rock); halo.addColorStop(1, palette.ground);
					ctx.globalAlpha = landmark.kind === 'crater' ? 0.8 : 0.35; ctx.fillStyle = halo;
					ctx.beginPath(); ctx.ellipse(0, 0, landmark.radius, landmark.radius * 0.8, 0, 0, Math.PI * 2); ctx.fill();
				}
				ctx.restore();
			}
			for (const [index, site] of map.sites.entries()) {
				ctx.strokeStyle = palette.dust; ctx.globalAlpha = 0.35; ctx.lineWidth = 3; ctx.strokeRect(site.x - 110, site.y - 90, 220, 180);
				ctx.font = 'bold 25px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = palette.dust; ctx.fillText(`SECTOR ${String(index + 1).padStart(2, '0')}`, site.x, site.y + 118);
			}
			ctx.globalAlpha = 0.28;
			for (let i = 0; i < 24000; i++) { ctx.fillStyle = i % 3 ? palette.rock : palette.dust; ctx.fillRect(random() * map.width, random() * map.height, 1 + random() * 4, 1 + random() * 3); }
			ctx.globalAlpha = 1;
			const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4; textures.add(texture);
			groundSurface.color.set('#ffffff'); groundSurface.map = texture;
		}
	}
	const ground = new Mesh(geometry(new PlaneGeometry(map.width, map.height)), groundSurface);
	ground.name = 'planet-surface'; ground.rotation.x = -Math.PI / 2; ground.position.set(map.width / 2, -0.03, map.height / 2); ground.receiveShadow = true; root.add(ground);
	const scratch = new Object3D(); const color = new Color();
	const rocks = map.landmarks.filter(function (landmark) { return landmark.kind === 'rocks'; });
	const stones = new InstancedMesh(rockShape, material(new MeshStandardMaterial({ color: '#ffffff', roughness: 1 })), rocks.length * 6);
	stones.name = 'surface-relief'; stones.receiveShadow = true; root.add(stones); batches.push(stones);
	for (const [index, rock] of rocks.entries()) for (let piece = 0; piece < 6; piece++) {
		const angle = random() * Math.PI * 2; const spread = random() * rock.radius * 0.7;
		const radius = 5 + random() * 15; const height = 1 + random() * 4;
		scratch.position.set(rock.x + Math.cos(angle) * spread, height / 2, rock.y + Math.sin(angle) * spread);
		scratch.rotation.set(0, random() * Math.PI, 0); scratch.scale.set(radius, height, radius * 0.7); scratch.updateMatrix();
		stones.setMatrixAt(index * 6 + piece, scratch.matrix); stones.setColorAt(index * 6 + piece, color.set(piece % 2 ? palette.rock : palette.dust));
	}
	const boundaryCount = 2 * (Math.ceil(map.width / 180) + Math.ceil(map.height / 180));
	const boundary = new InstancedMesh(cube, paint, boundaryCount); boundary.name = 'mission-boundary'; root.add(boundary); batches.push(boundary);
	let boundaryIndex = 0;
	const boundaryMark = function (x: number, y: number, angle: number) {
		scratch.position.set(x, 0.15, y); scratch.rotation.set(0, angle, 0); scratch.scale.set(72, 0.2, 8); scratch.updateMatrix(); boundary.setMatrixAt(boundaryIndex++, scratch.matrix);
	};
	for (let x = 60; x < map.width; x += 180) { boundaryMark(x, 28, 0); boundaryMark(x, map.height - 28, 0); }
	for (let y = 60; y < map.height; y += 180) { boundaryMark(28, y, Math.PI / 2); boundaryMark(map.width - 28, y, Math.PI / 2); }
	boundary.count = boundaryIndex;
	// Silhouettes outside navigation bounds give each biome a horizon without
	// adding invisible collision inside the traversable contract area.
	const hills = new InstancedMesh(rockShape, material(new MeshStandardMaterial({ color: palette.rock, roughness: 1 })), 36);
	hills.name = 'distant-ridges'; hills.receiveShadow = true; root.add(hills); batches.push(hills);
	for (let i = 0; i < 36; i++) {
		const side = i % 4; const radius = 100 + random() * 180; const height = 80 + random() * 260; const offset = radius + 90;
		const x = side < 2 ? random() * map.width : side === 2 ? -offset : map.width + offset;
		const y = side >= 2 ? random() * map.height : side === 0 ? -offset : map.height + offset;
		scratch.position.set(x, height / 2 - 3, y); scratch.rotation.set(0, random() * Math.PI, 0); scratch.scale.set(radius, height, radius); scratch.updateMatrix(); hills.setMatrixAt(i, scratch.matrix);
	}
	const pad = function (name: string, at: { x: number; y: number }, surface: Material, radius: number) {
		const value = new Group(); value.name = name; value.position.set(at.x, 0, at.y); root.add(value);
		const outline = new Mesh(geometry(new RingGeometry(radius - 3, radius, 64)), surface); outline.rotation.x = -Math.PI / 2; outline.position.y = 0.12; value.add(outline);
		for (const x of [-1, 1]) for (const z of [-1, 1]) box(value, surface, x * radius * 0.58, 0.15, z * radius * 0.58, 26, 0.3, 6);
		return value;
	};
	pad('drop-zone', map.drop, paint, 110);
	const extraction = pad('extraction-zone', map.extraction, green, EXTRACTION_RADIUS);
	const progress = new Mesh(geometry(new RingGeometry(EXTRACTION_RADIUS - 12, EXTRACTION_RADIUS - 7, 64)), green); progress.rotation.x = -Math.PI / 2; progress.position.y = 0.16; extraction.add(progress);
	const objective = pad('mission-objective', map.objective, orange, 100);
	const facility = new Group(); facility.name = 'mission-facility'; root.add(facility);
	const intact = new Group(); intact.name = 'facility-intact'; facility.add(intact);
	box(intact, dark, 0, 0, 0, 106, 8, 100); box(intact, steel, 0, 8, 0, 88, 64, 80);
	box(intact, dark, 0, 72, 0, 96, 7, 88); box(intact, orange, 0, 60, 0, 91, 7, 83);
	for (const x of [-27, 27]) { box(intact, dark, x, 79, 0, 17, 18, 55); box(intact, steel, x, 97, 0, 19, 3, 57); }
	for (const z of [-41, 41]) for (const x of [-30, 0, 30]) box(intact, dark, x, 12, z, 7, 46, 2);
	const rubble = new Group(); rubble.name = 'facility-rubble'; facility.add(rubble);
	box(rubble, dark, 0, 0, 0, 112, 7, 104);
	for (let i = 0; i < 9; i++) { const piece = box(rubble, i % 2 ? steel : dark, Math.cos(i * 2.4) * 38, 7, Math.sin(i * 2.4) * 35, 18 + i * 2, 7 + i % 3 * 9, 23); piece.rotation.y = i * 1.8; }
	let disposed = false;
	return {
		root,
		update: function (mission: MissionRuntime, time: number, reducedMotion: boolean) {
			if (disposed) return;
			const ready = mission.stage === 'extract';
			extraction.visible = ready; objective.visible = !ready && (mission.contract.kind === 'defend' || mission.contract.kind === 'demolition');
			extraction.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(time * 2) * 0.015);
			progress.visible = mission.extractTime > 0;
			progress.scale.setScalar(Math.max(0.03, Math.min(1, mission.extractTime / EXTRACTION_SECONDS)));
			facility.visible = Boolean(mission.structure);
			if (mission.structure) {
				facility.position.set(mission.structure.x, 0, mission.structure.y);
				intact.visible = mission.structure.hp > 0; rubble.visible = !intact.visible;
			}
		},
		dispose: function () {
			if (disposed) return; disposed = true;
			for (const batch of batches) batch.dispose();
			for (const asset of geometries) asset.dispose(); for (const asset of materials) asset.dispose(); for (const asset of textures) asset.dispose();
			root.removeFromParent(); root.clear();
		},
	};
};
