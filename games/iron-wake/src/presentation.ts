import ECSpresso from 'ecspresso';
import { createGroupComponents, createRenderer3DPlugin } from 'ecspresso/plugins/rendering/renderer3D';
import { BufferGeometry, Color, DirectionalLight, HemisphereLight, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, OrthographicCamera, RingGeometry, Scene, Vector3, WebGLRenderer } from 'three';
import { createGait, mechScale, type Gaits } from './gait';
import { createMech } from './mech-3d';
import { drawOverlay } from './overlay';
import { alignCamera, toGround, toScreen } from './projection-3d';
import type { EnemyKind, Point, State } from './simulation';
import { createWorldObjects } from './world-3d';

export const createPresentation = async function (canvas: HTMLCanvasElement) {
	const labels = document.createElement('canvas'); labels.className = 'world-labels'; labels.setAttribute('aria-hidden', 'true');
	const ctx = labels.getContext('2d'); if (!ctx) throw new Error('Overlay unavailable');
	const renderer = new WebGLRenderer({ canvas, antialias: true });
	canvas.after(labels);
	const scene = new Scene(); scene.background = new Color('#172630');
	const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 6000);
	scene.add(new HemisphereLight('#dce9f2', '#26323a', 2));
	const sun = new DirectionalLight('#fff1d8', 2.4); sun.position.set(-300, 800, 500); scene.add(sun);
	const objects = createWorldObjects(scene);
	const reticleGeometry = new RingGeometry(14, 15, 48);
	const reticleMaterial = new MeshBasicMaterial({ color: '#c2e8e0', transparent: true, opacity: 0.65, depthWrite: false });
	const reticle = new Mesh(reticleGeometry, reticleMaterial); reticle.rotation.x = -Math.PI / 2; scene.add(reticle);
	const barrelGeometry = new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]);
	const barrelMaterial = new LineBasicMaterial({ color: '#b5e4e0', transparent: true, opacity: 0.25, depthWrite: false });
	const barrel = new Line(barrelGeometry, barrelMaterial); barrel.frustumCulled = false; scene.add(barrel);
	const world = ECSpresso.create().withPlugin(createRenderer3DPlugin({ renderer, scene, camera, startLoop: false })).build();
	const makeUnit = function (kind?: EnemyKind) { const model = createMech(kind); return { model, kind, entity: world.spawn(createGroupComponents(model.root)) }; };
	const enemies = new Map<number, ReturnType<typeof makeUnit>>();
	let player: ReturnType<typeof makeUnit> | undefined;
	let width = 1; let height = 1; let disposed = false;
	const dispose = async function () {
		if (disposed) return; disposed = true;
		try { await world.dispose(); }
		finally {
			player?.model.dispose(); for (const enemy of enemies.values()) enemy.model.dispose(); enemies.clear();
			objects.dispose(); reticleGeometry.dispose(); reticleMaterial.dispose(); barrelGeometry.dispose(); barrelMaterial.dispose();
			scene.clear(); labels.remove(); renderer.dispose(); renderer.forceContextLoss();
		}
	};
	try { await world.initialize(); player = makeUnit(); }
	catch (error: unknown) { await dispose(); throw error; }
	const resize = function (state: State, nextWidth: number, nextHeight: number, reducedMotion: boolean) {
		width = nextWidth; height = nextHeight;
		if (disposed || width <= 0 || height <= 0) return;
		const dpr = Math.min(devicePixelRatio, 2);
		if (renderer.getPixelRatio() !== dpr || canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
			renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
		}
		if (labels.width !== canvas.width || labels.height !== canvas.height) { labels.width = canvas.width; labels.height = canvas.height; }
		camera.clearViewOffset(); alignCamera(camera, width, height, state);
		if (!reducedMotion && state.shake > 0) camera.setViewOffset(width, height, -Math.sin(state.time * 79) * state.shake, -Math.cos(state.time * 91) * state.shake, width, height);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	};
	const pose = function (unit: ReturnType<typeof makeUnit>, gait: Gaits['player'], heading: number) {
		unit.entity.components.localTransform3D.x = gait.body.x; unit.entity.components.localTransform3D.z = gait.body.y;
		world.markChanged(unit.entity.id, 'localTransform3D'); unit.model.pose(gait, heading);
	};
	return {
		resize,
		toGround: function (point: Point) { return toGround(point, camera, width, height); },
		toScreen: function (point: Point, elevation = 0) { return toScreen(point, camera, width, height, elevation); },
		render: function (state: State, aim: Point, gaits: Gaits, reducedMotion: boolean) {
			if (disposed || width <= 0 || height <= 0) return;
			resize(state, width, height, reducedMotion);
			if (player) pose(player, gaits.player, state.player.turret);
			const live = new Set(state.enemies.map(function (enemy) { return enemy.id; }));
			for (const [id, unit] of enemies) if (!live.has(id)) { world.removeEntity(unit.entity.id); unit.model.dispose(); enemies.delete(id); }
			for (const enemy of state.enemies) {
				let unit = enemies.get(enemy.id);
				if (unit && unit.kind !== enemy.kind) { world.removeEntity(unit.entity.id); unit.model.dispose(); unit = undefined; }
				if (!unit) { unit = makeUnit(enemy.kind); enemies.set(enemy.id, unit); }
				pose(unit, gaits.enemies.get(enemy.id) ?? createGait(enemy, mechScale(enemy.kind)), enemy.angle);
			}
			objects.update(state, reducedMotion);
			reticle.position.set(aim.x, 0.25, aim.y);
			const positions = barrelGeometry.getAttribute('position'); const p = state.player;
			positions.setXYZ(0, p.x, 0.25, p.y); positions.setXYZ(1, p.x + Math.cos(p.turret) * 110, 0.25, p.y + Math.sin(p.turret) * 110); positions.needsUpdate = true;
			world.update(0);
			drawOverlay(ctx, width, height, state, aim, { reducedMotion, showRadar: width > 700 && height > 520, gaits, camera });
		},
		diagnostics: function () { return { calls: renderer.info.render.calls, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }; },
		dispose,
	};
};
