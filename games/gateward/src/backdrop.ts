import { BufferAttribute, BufferGeometry, IcosahedronGeometry, InstancedMesh, LineBasicMaterial, LineSegments, MeshStandardMaterial, Object3D, Points, PointsMaterial, Vector3, type Scene } from 'three';
import { tactical } from './combat-scale';
import { toWorld, type View } from './projection';
import type { Point, State } from './simulation';

const GRID_HEIGHT = -105;
const ROCK_HEIGHT = -160;
const ROCK_CELL = tactical(200);

// Snap the camera footprint to world cells. Objects retain their positions while
// travelling or zooming; only cells outside the viewport are replaced.
export const backdropBounds = function (view: View, origin: Point, spacing: number) {
	const corners = [GRID_HEIGHT, ROCK_HEIGHT].flatMap(function (height) {
		return [{ x: 0, y: 0 }, { x: view.width, y: 0 }, { x: 0, y: view.height }, { x: view.width, y: view.height }]
			.flatMap(function (point) { const world = toWorld(point, view, height); return world ? [world] : []; });
	});
	const footprint = corners.length ? corners : [origin];
	const xs = footprint.map(function (point) { return point.x - origin.x; });
	const ys = footprint.map(function (point) { return point.y - origin.y; });
	return {
		left: Math.floor(Math.min(...xs) / spacing) - 1, right: Math.ceil(Math.max(...xs) / spacing) + 1,
		top: Math.floor(Math.min(...ys) / spacing) - 1, bottom: Math.ceil(Math.max(...ys) / spacing) + 1,
	};
};
export const gridSpacing = function (zoom: number): number {
	return 160 * 2 ** Math.max(0, Math.floor(Math.log2(1 / zoom)));
};
const fraction = function (value: number): number { return value - Math.floor(value); };
export const rockAt = function (x: number, y: number, cell = ROCK_CELL, scale = tactical(1)) {
	const seed = fraction(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
	return { x: (x + 0.15 + seed * 0.7) * cell, y: (y + 0.15 + fraction(seed * 19.7) * 0.7) * cell, radius: (18 + seed * 27) * scale, angle: seed * Math.PI * 2 };
};

export const createBackdrop = function (scene: Scene) {
	const navigation = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: '#254255', transparent: true, opacity: 0.24 })); scene.add(navigation);
	const geometry = new IcosahedronGeometry(1, 0); const material = new MeshStandardMaterial({ color: '#1a2b3b', roughness: 1 });
	let rocks = new InstancedMesh(geometry, material, 1); scene.add(rocks);
	const transform = new Object3D();
	let gridSignature = ''; let rockSignature = '';
	const stars = [0.08, 0.2, 0.46].map(function (parallax, layer) {
		const positions = new Float32Array(100 * 3);
		const starGeometry = new BufferGeometry(); starGeometry.setAttribute('position', new BufferAttribute(positions, 3));
		const points = new Points(starGeometry, new PointsMaterial({ color: layer === 2 ? '#7a94a6' : '#3b5064', size: layer === 2 ? 1.8 : 1.2, sizeAttenuation: false, depthWrite: false }));
		points.frustumCulled = false; scene.add(points); return { points, positions, parallax, layer };
	});
	return function (state: State, view: View, reducedMotion: boolean) {
		const origin = state.routeOrigin;
		const spacing = gridSpacing(view.camera.zoom); const grid = backdropBounds(view, origin, spacing);
		const gridKey = `${origin.x}/${origin.y}/${spacing}/${Object.values(grid).join('/')}`;
		if (gridKey !== gridSignature) {
			gridSignature = gridKey;
			const positions: number[] = [];
			for (let x = grid.left; x <= grid.right; x++) positions.push(x * spacing, GRID_HEIGHT, grid.top * spacing, x * spacing, GRID_HEIGHT, grid.bottom * spacing);
			for (let y = grid.top; y <= grid.bottom; y++) positions.push(grid.left * spacing, GRID_HEIGHT, y * spacing, grid.right * spacing, GRID_HEIGHT, y * spacing);
			navigation.geometry.dispose(); navigation.geometry = new BufferGeometry(); navigation.geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
			navigation.position.set(origin.x, 0, origin.y);
		}
		const cells = backdropBounds(view, origin, ROCK_CELL);
		const nearX = Math.floor((state.ark.x - origin.x) / 200); const nearY = Math.floor((state.ark.y - origin.y) / 200);
		const nearDetail = Math.max(0, Math.min(1, (view.camera.zoom - 0.25) / 0.4));
		const rockKey = `${origin.x}/${origin.y}/${Object.values(cells).join('/')}/${nearX}/${nearY}/${nearDetail}`;
		if (rockKey !== rockSignature) {
			rockSignature = rockKey;
			const placements: ReturnType<typeof rockAt>[] = [];
			for (let x = cells.left; x <= cells.right; x++) for (let y = cells.top; y <= cells.bottom; y++) {
				const rock = rockAt(x, y);
				if (Math.abs(rock.y) >= tactical(350)) placements.push(rock);
			}
			// Small nearby debris preserves detail when zoomed in; the larger
			// outer field remains legible across the expanded combat space. Fade
			// small debris out at wide zoom so its local detail patch has no edge.
			for (let x = nearX - 8; x <= nearX + 8; x++) for (let y = nearY - 8; y <= nearY + 8; y++) {
				const rock = rockAt(x, y, 200, 1);
				if (Math.abs(rock.y) >= 350) placements.push({ ...rock, radius: rock.radius * nearDetail });
			}
			if (placements.length > rocks.instanceMatrix.count) { scene.remove(rocks); rocks.dispose(); rocks = new InstancedMesh(geometry, material, placements.length); scene.add(rocks); }
			let index = 0;
			for (const rock of placements) {
				transform.position.set(origin.x + rock.x, ROCK_HEIGHT, origin.y + rock.y); transform.scale.setScalar(rock.radius); transform.rotation.set(rock.angle * 0.4, rock.angle, rock.angle * 0.17); transform.updateMatrix(); rocks.setMatrixAt(index++, transform.matrix);
			}
			rocks.count = index; rocks.instanceMatrix.needsUpdate = true; rocks.computeBoundingSphere();
		}
		const lower = new Vector3(-1, -1, 0).applyMatrix4(view.camera.projectionMatrixInverse);
		const upper = new Vector3(1, 1, 0).applyMatrix4(view.camera.projectionMatrixInverse);
		// Camera-aligned distant layers keep the original screen-space density at
		// every zoom and orbit instead of revealing the edge of a small star box.
		for (const { points, positions, parallax, layer } of stars) {
			points.position.copy(view.camera.position); points.quaternion.copy(view.camera.quaternion);
			const width = (upper.x - lower.x) * 1.3;
			const height = (upper.y - lower.y) * 1.3;
			const drift = reducedMotion ? 0 : state.systems.distanceTraveled * parallax / tactical(3000);
			for (let i = 0; i < 100; i++) {
				positions[i * 3] = (fraction(i * 0.17373 + layer * 0.313 - drift) - 0.5) * width + (upper.x + lower.x) / 2;
				positions[i * 3 + 1] = (fraction(i * 0.9731 + layer * 0.217) - 0.5) * height + (upper.y + lower.y) / 2;
				positions[i * 3 + 2] = -view.camera.far * (0.75 + layer * 0.03);
			}
			points.geometry.getAttribute('position').needsUpdate = true;
		}
	};
};
