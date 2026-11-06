import { BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, Group, InstancedMesh, Material, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, SRGBColorSpace, Texture } from 'three';
import { ARENA } from './simulation';

interface Part { matrix: Matrix4; color: Color }

// An authored yard with baked paint, wear and contact shading. All large
// industrial structures sit outside the traversable boundary; lane markings
// and service channels inside it are flush with the ground.
export const createEnvironment = function () {
	const root = new Group(); root.name = 'relay-yard';
	const geometries = new Set<BufferGeometry>(); const materials = new Set<Material>(); const textures = new Set<Texture>();
	const batches: InstancedMesh[] = [];
	const geometry = function <T extends BufferGeometry>(value: T) { geometries.add(value); return value; };
	const material = function <T extends Material>(value: T) { materials.add(value); return value; };
	const cube = geometry(new BoxGeometry(1, 1, 1)); const cylinder = geometry(new CylinderGeometry(1, 1, 1, 16));
	const steel = material(new MeshStandardMaterial({ color: '#ffffff', roughness: 0.82, metalness: 0.25 }));
	const lights = material(new MeshBasicMaterial({ color: '#ffffff' }));
	const boxParts: Part[] = []; const roundParts: Part[] = []; const lightParts: Part[] = [];
	const scratch = new Object3D();
	const part = function (list: Part[], color: string, x: number, y: number, z: number, width: number, height: number, depth: number, angle = 0) {
		scratch.position.set(x, y + height / 2, z); scratch.scale.set(width, height, depth); scratch.rotation.set(0, angle, 0); scratch.updateMatrix();
		list.push({ matrix: scratch.matrix.clone(), color: new Color(color) });
	};
	const box = function (color: string, x: number, y: number, z: number, width: number, height: number, depth: number, angle = 0) {
		part(boxParts, color, x, y, z, width, height, depth, angle);
	};
	const light = function (color: string, x: number, y: number, z: number, width: number, height: number, depth: number) {
		part(lightParts, color, x, y, z, width, height, depth);
	};
	const tank = function (x: number, z: number, radius: number, height: number) {
		part(roundParts, '#39494c', x, 0, z, radius + 7, 12, radius + 7);
		part(roundParts, '#69736e', x, 12, z, radius, height, radius);
		for (const y of [20, height * 0.55, height]) part(roundParts, '#293b40', x, y, z, radius + 1.4, 5, radius + 1.4);
		part(roundParts, '#87908a', x, height + 12, z, radius * 0.8, 6, radius * 0.8);
		for (let i = 0; i < 4; i++) box('#9d865b', x + radius * 0.6, 16 + i * 17, z + radius * 0.78, 3, 2, 12);
	};
	const hangar = function (x: number, z: number, width: number, depth: number, height: number, accent: string) {
		box('#17262b', x + 12, 0, z + 14, width + 30, 3, depth + 30);
		box('#36484d', x, 0, z, width, height, depth);
		box('#59676a', x, height, z, width + 8, 6, depth + 8);
		box(accent, x, height - 13, z, width + 3, 8, depth + 3);
		for (let dx = -width / 2 + 15; dx < width / 2; dx += 24) {
			box('#26373b', x + dx, 0, z + depth / 2 + 1, 4, height - 14, 3);
			box('#798078', x + dx, height + 7, z, 3, 2, depth - 8);
		}
		box('#18272c', x, 3, z + depth / 2 + 3, width * 0.56, height * 0.65, 3);
		for (let y = 8; y < height * 0.65; y += 8) box('#384b4e', x, y, z + depth / 2 + 5, width * 0.55, 2, 2);
		for (const dx of [-width * 0.4, width * 0.4]) {
			light('#ffca7e', x + dx, height * 0.7, z + depth / 2 + 5, 16, 3, 4);
			box('#24353b', x + dx, height + 7, z - 10, 20, 14, 28);
			for (let vent = -9; vent <= 9; vent += 6) box('#768381', x + dx + vent, height + 21.2, z - 10, 2, 1, 25);
		}
	};
	// Distant factories frame the arena without creating apparent walk-through
	// cover in its playable interior.
	hangar(360, -115, 270, 170, 110, '#9c7c4f');
	hangar(1250, -120, 340, 180, 130, '#3c6b71');
	hangar(-120, 350, 170, 280, 105, '#8b7550');
	hangar(1930, 860, 180, 300, 95, '#586b6a');
	hangar(490, 1320, 300, 150, 105, '#a17b49');
	for (const x of [720, 815, 910]) tank(x, -90, 36, 100 + x % 3 * 18);
	for (const z of [180, 280, 380]) tank(1885, z, 44, 130);
	for (const x of [1220, 1335, 1450]) tank(x, 1290, 42, 115);
	// A pipeline gantry and the long loading crane make the yard recognizable
	// as the player patrols its perimeter.
	for (const x of [1070, 1520]) {
		box('#514d3e', x, 0, -48, 18, 165, 18);
		box('#8b754b', x, 155, -48, 42, 12, 35);
	}
	box('#a78850', 1295, 167, -48, 500, 14, 24);
	box('#313e3f', 1300, 181, -48, 510, 4, 4);
	box('#74634b', 1460, 130, -48, 25, 38, 28);
	box('#18282c', 1460, 28, -48, 2, 100, 2);
	for (const x of [-70, 1870]) {
		box('#384547', x, 60, 620, 20, 15, 420);
		for (const z of [440, 620, 800]) box('#625d49', x, 0, z, 12, 60, 12);
		for (let z = 430; z < 840; z += 35) box('#8c8b78', x, 65, z, 23, 5, 4);
	}
	// Low boundary curb, inset amber lamps, and segmented hazard barriers.
	for (let x = 0; x <= ARENA.width; x += 90) for (const z of [-9, ARENA.height + 9]) {
		box('#4a5653', x, 0, z, 72, 9, 15);
		box('#ae8f56', x, 9, z, 72, 2, 12);
		light('#f4bc6b', x, 11, z, 11, 2, 5);
	}
	for (let z = 30; z < ARENA.height; z += 90) for (const x of [-9, ARENA.width + 9]) {
		box('#4a5653', x, 0, z, 15, 9, 72); light('#f4bc6b', x, 10, z, 5, 2, 11);
	}
	for (const x of [90, 1710]) for (const z of [-40, 1240]) {
		box('#33464a', x, 0, z, 8, 130, 8); box('#69716a', x, 125, z, 36, 5, 12);
		light('#ffd59a', x, 123, z + 5, 30, 3, 5);
	}
	const build = function (name: string, shape: BufferGeometry, surface: Material, parts: readonly Part[]) {
		const batch = new InstancedMesh(shape, surface, parts.length); batch.name = name;
		parts.forEach(function (value, index) { batch.setMatrixAt(index, value.matrix); batch.setColorAt(index, value.color); });
		batch.castShadow = true; batch.receiveShadow = true; root.add(batch); batches.push(batch);
	};
	build('yard-structures', cube, steel, boxParts); build('cooling-tanks', cylinder, steel, roundParts); build('sodium-lamps', cube, lights, lightParts);
	// The terrain texture is artwork generated from deterministic drawing
	// commands. Headless simulation/geometry tests do not need a DOM canvas.
	if (typeof document !== 'undefined') {
		const canvas = document.createElement('canvas'); canvas.width = 2304; canvas.height = 1536;
		const ctx = canvas.getContext('2d');
		if (ctx) {
			ctx.scale(canvas.width / ARENA.width, canvas.height / ARENA.height);
			ctx.fillStyle = '#344044'; ctx.fillRect(0, 0, ARENA.width, ARENA.height);
			let seed = 901;
			const random = function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
			for (let x = 0; x < ARENA.width; x += 150) for (let z = 0; z < ARENA.height; z += 150) {
				const tone = 47 + Math.floor(random() * 10);
				ctx.fillStyle = `rgb(${tone},${tone + 12},${tone + 15})`; ctx.fillRect(x + 1, z + 1, 148, 148);
				ctx.strokeStyle = '#59615d44'; ctx.lineWidth = 1; ctx.strokeRect(x + 3, z + 3, 144, 144);
			}
			// The cross-yard service road is broad enough to read below combat.
			ctx.fillStyle = '#273237'; ctx.fillRect(0, 497, 1800, 206); ctx.fillRect(797, 0, 206, 1200);
			ctx.fillStyle = '#1b292c'; ctx.fillRect(0, 497, 1800, 6); ctx.fillRect(0, 697, 1800, 6);
			ctx.fillRect(797, 0, 6, 1200); ctx.fillRect(997, 0, 6, 1200);
			ctx.strokeStyle = '#9d946b88'; ctx.lineWidth = 3; ctx.setLineDash([32, 24]);
			ctx.beginPath(); ctx.moveTo(0, 600); ctx.lineTo(1800, 600); ctx.moveTo(900, 0); ctx.lineTo(900, 1200); ctx.stroke(); ctx.setLineDash([]);
			ctx.strokeStyle = '#7a81766b'; ctx.lineWidth = 2;
			for (const y of [512, 688]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1800, y); ctx.stroke(); }
			for (const x of [812, 988]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1200); ctx.stroke(); }
			// Grilles and recessed cable runs are decorative ground detail.
			for (const z of [320, 880]) {
				ctx.fillStyle = '#18272b'; ctx.fillRect(310, z, 1180, 14);
				ctx.fillStyle = '#4a5a5b';
				for (let x = 310; x < 1490; x += 12) ctx.fillRect(x, z + 1, 3, 12);
			}
			for (const x of [420, 1380]) {
				ctx.fillStyle = '#263438'; ctx.fillRect(x, 350, 70, 120);
				ctx.strokeStyle = '#6b7467'; ctx.lineWidth = 2; ctx.strokeRect(x, 350, 70, 120);
				for (let i = 0; i < 10; i++) { ctx.fillStyle = '#17272b'; ctx.fillRect(x + 5, 356 + i * 11, 60, 5); }
			}
			// Uplink apron: concentric segmented octagons and clear exclusion paint.
			const octagon = function (radius: number) {
				ctx.beginPath();
				for (let i = 0; i <= 8; i++) { const angle = i * Math.PI / 4 + Math.PI / 8; const x = 900 + Math.cos(angle) * radius; const y = 600 + Math.sin(angle) * radius; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
				ctx.closePath();
			};
			octagon(184); ctx.fillStyle = '#435050'; ctx.fill(); ctx.strokeStyle = '#9f9d7e'; ctx.lineWidth = 4; ctx.stroke();
			octagon(174); ctx.strokeStyle = '#192b30'; ctx.lineWidth = 8; ctx.stroke();
			octagon(160); ctx.strokeStyle = '#91b6ae55'; ctx.lineWidth = 2; ctx.stroke();
			for (let i = 0; i < 16; i++) {
				const angle = i * Math.PI / 8; ctx.save(); ctx.translate(900 + Math.cos(angle) * 177, 600 + Math.sin(angle) * 177); ctx.rotate(angle);
				ctx.fillStyle = i % 2 ? '#d0b576' : '#202e30'; ctx.fillRect(-5, -10, 10, 20); ctx.restore();
			}
			const stencil = function (text: string, x: number, y: number, size: number, color: string, rotation = 0) {
				ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.font = `900 ${size}px monospace`; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(text, 0, 0); ctx.restore();
			};
			stencil('09', 900, 1060, 134, '#9ba79680'); stencil('NORTHLINE', 1145, 800, 31, '#a9b1a080');
			stencil('RELAY // 09', 1145, 836, 19, '#b8b69a70'); stencil('KEEP CLEAR', 680, 610, 17, '#d3b774aa', -Math.PI / 2);
			stencil('TRANSFER', 430, 650, 18, '#b3b49c77'); stencil('SECTOR 01', 445, 275, 24, '#9fae9c66');
			stencil('SECTOR 02', 1370, 960, 24, '#9fae9c66');
			for (const x of [510, 1280]) for (const y of [540, 660]) {
				ctx.save(); ctx.translate(x, y); if (y < 600) ctx.rotate(Math.PI);
				ctx.fillStyle = '#a5a68b88'; ctx.beginPath(); ctx.moveTo(-25, -3); ctx.lineTo(5, -3); ctx.lineTo(5, -12); ctx.lineTo(25, 0); ctx.lineTo(5, 12); ctx.lineTo(5, 3); ctx.lineTo(-25, 3); ctx.fill(); ctx.restore();
			}
			// Oil halos, worn aggregate and fine pitting avoid a pristine grid.
			for (let i = 0; i < 100; i++) {
				const x = random() * 1800; const y = random() * 1200; const radius = 8 + random() * 42;
				const stain = ctx.createRadialGradient(x, y, 0, x, y, radius); stain.addColorStop(0, '#0c1b2240'); stain.addColorStop(1, '#0c1b2200');
				ctx.fillStyle = stain; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
			}
			for (let i = 0; i < 35000; i++) {
				ctx.fillStyle = i % 3 ? '#0a1e291c' : '#d4d1ad17';
				ctx.fillRect(random() * 1800, random() * 1200, 0.5 + random() * 2.5, 0.5 + random() * 1.5);
			}
			for (let i = 0; i < 75; i++) {
				const x = random() * 1800; const y = random() * 1200; ctx.strokeStyle = '#14262d66'; ctx.lineWidth = 0.7;
				ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + random() * 25, y + random() * 9); ctx.lineTo(x + 30 + random() * 22, y - random() * 15); ctx.stroke();
			}
			const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4; textures.add(texture);
			const groundMaterial = material(new MeshStandardMaterial({ map: texture, roughness: 0.96, metalness: 0.05 }));
			const ground = new Mesh(geometry(new PlaneGeometry(ARENA.width, ARENA.height)), groundMaterial); ground.name = 'painted-yard';
			ground.rotation.x = -Math.PI / 2; ground.position.set(900, -0.01, 600); ground.receiveShadow = true; root.add(ground);
		}
	}
	let disposed = false;
	return { root, dispose: function () {
		if (disposed) return; disposed = true;
		for (const batch of batches) batch.dispose();
		for (const value of geometries) value.dispose(); for (const value of materials) value.dispose(); for (const value of textures) value.dispose();
		root.removeFromParent(); root.clear();
	} };
};
