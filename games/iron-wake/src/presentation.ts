import ECSpresso from 'ecspresso';
import { createGroupComponents, createRenderer3DPlugin } from 'ecspresso/plugins/rendering/renderer3D';
import { ACESFilmicToneMapping, BufferGeometry, Color, DirectionalLight, Fog, HemisphereLight, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, OrthographicCamera, PCFShadowMap, RingGeometry, Scene, Vector3, WebGLRenderer } from 'three';
import { createGait, mechScale, type Gaits } from './gait';
import { createMech } from './mech-3d';
import { drawOverlay, type ScreenRect } from './overlay';
import { alignCamera, toGround, toScreen } from './projection-3d';
import type { EnemyKind, Point, State } from './simulation';
import { createWorldObjects } from './world-3d';

export const createPresentation = async function (canvas: HTMLCanvasElement) {
	const labels = document.createElement('canvas'); labels.className = 'world-labels'; labels.setAttribute('aria-hidden', 'true');
	const ctx = labels.getContext('2d'); if (!ctx) throw new Error('Overlay unavailable');
	const renderer = new WebGLRenderer({ canvas, antialias: true });
	renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
	renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
	canvas.after(labels);
	const scene = new Scene(); scene.background = new Color('#142329'); scene.fog = new Fog('#1c3035', 1700, 3200);
	const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 6000);
	scene.add(new HemisphereLight('#c4e5e7', '#28302c', 1.4));
	const sun = new DirectionalLight('#ffd9a0', 3.1); sun.position.set(-300, 800, 500); sun.castShadow = true;
	sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -680; sun.shadow.camera.right = 680;
	sun.shadow.camera.top = 680; sun.shadow.camera.bottom = -680; sun.shadow.camera.near = 10; sun.shadow.camera.far = 2200;
	sun.shadow.normalBias = 2; sun.shadow.bias = -0.0003; scene.add(sun, sun.target);
	const fill = new DirectionalLight('#a3d1d8', 1.05); scene.add(fill, fill.target);
	const objects = createWorldObjects(scene);
	const reticleGeometry = new RingGeometry(17, 18.5, 48);
	const reticleMaterial = new MeshBasicMaterial({ color: '#d8f2de', transparent: true, opacity: 0.85, depthWrite: false });
	const reticle = new Mesh(reticleGeometry, reticleMaterial); reticle.rotation.x = -Math.PI / 2; scene.add(reticle);
	const barrelGeometry = new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]);
	const barrelMaterial = new LineBasicMaterial({ color: '#b5e4e0', transparent: true, opacity: 0.25, depthWrite: false });
	const barrel = new Line(barrelGeometry, barrelMaterial); barrel.frustumCulled = false; scene.add(barrel);
	const world = ECSpresso.create().withPlugin(createRenderer3DPlugin({ renderer, scene, camera, startLoop: false })).build();
	const makeUnit = function (kind?: EnemyKind, commander = false) {
		const model = createMech(kind, commander); const damage: { hp: number | undefined; hitAt: number } = { hp: undefined, hitAt: -10 };
		return { model, kind, commander, damage, entity: world.spawn(createGroupComponents(model.root)) };
	};
	const enemies = new Map<number, ReturnType<typeof makeUnit>>();
	let player: ReturnType<typeof makeUnit> | undefined;
	let width = 1; let height = 1; let disposed = false; let previousStateTime = 0;
	const dispose = async function () {
		if (disposed) return; disposed = true;
		try { await world.dispose(); }
		finally {
			player?.model.dispose(); for (const enemy of enemies.values()) enemy.model.dispose(); enemies.clear();
			objects.dispose(); reticleGeometry.dispose(); reticleMaterial.dispose(); barrelGeometry.dispose(); barrelMaterial.dispose(); sun.shadow.dispose();
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
		camera.clearViewOffset(); camera.zoom = 1; alignCamera(camera, width, height, state);
		if (!reducedMotion && state.shake > 0) camera.setViewOffset(width, height, -Math.sin(state.time * 79) * state.shake, -Math.cos(state.time * 91) * state.shake, width, height);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	};
	const pose = function (unit: ReturnType<typeof makeUnit>, gait: Gaits['player'], heading: number, hp: number, state: State, reducedMotion: boolean, recoil = 0) {
		if (unit.damage.hp !== undefined && hp < unit.damage.hp) unit.damage.hitAt = state.time;
		unit.damage.hp = hp;
		unit.entity.components.localTransform3D.x = gait.body.x; unit.entity.components.localTransform3D.z = gait.body.y;
		world.markChanged(unit.entity.id, 'localTransform3D'); unit.model.pose(gait, heading, { hit: Math.max(0, 1 - (state.time - unit.damage.hitAt) / 0.16), recoil, heat: kindHeat(unit.kind, state), time: state.time, reducedMotion });
	};
	const kindHeat = function (kind: EnemyKind | undefined, state: State) { return kind ? 0 : state.player.heat; };
	return {
		resize,
		toGround: function (point: Point) { return toGround(point, camera, width, height); },
		toScreen: function (point: Point, elevation = 0) { return toScreen(point, camera, width, height, elevation); },
		render: function (state: State, aim: Point, gaits: Gaits, reducedMotion: boolean, attract = false, obstructions: readonly ScreenRect[] = []) {
			if (disposed || width <= 0 || height <= 0) return;
			if (state.time < previousStateTime && player) { player.damage.hp = undefined; player.damage.hitAt = -10; }
			previousStateTime = state.time;
			resize(state, width, height, reducedMotion);
			sun.position.set(state.player.x - 420, 900, state.player.y - 500); sun.target.position.set(state.player.x, 0, state.player.y);
			fill.position.set(state.player.x + 700, 450, state.player.y + 600); fill.target.position.set(state.player.x, 50, state.player.y);
			if (attract && width > 700) {
				camera.zoom = 1.65;
				camera.setViewOffset(width, height, -width * 0.2, -height * 0.11, width, height);
				camera.updateProjectionMatrix();
			}
			if (player) {
				const heading = attract ? Math.PI / 4 - 0.22 : state.player.turret;
				const gait = attract ? createGait({ ...state.player, angle: Math.PI / 4 + 0.15 }) : gaits.player;
				pose(player, gait, heading, state.player.hp, state, reducedMotion, Math.max(0, (state.cannonIn - 0.45) / 0.2));
				const transform = player.entity.components.localTransform3D;
				transform.sx = transform.sy = transform.sz = attract && width > 700 ? 1.55 : 1;
				world.markChanged(player.entity.id, 'localTransform3D');
			}
			const live = new Set(state.enemies.map(function (enemy) { return enemy.id; }));
			for (const [id, unit] of enemies) if (!live.has(id)) { world.removeEntity(unit.entity.id); unit.model.dispose(); enemies.delete(id); }
			for (const enemy of state.enemies) {
				let unit = enemies.get(enemy.id);
				if (unit && (unit.kind !== enemy.kind || unit.commander !== Boolean(enemy.commander))) { world.removeEntity(unit.entity.id); unit.model.dispose(); unit = undefined; }
				if (!unit) { unit = makeUnit(enemy.kind, enemy.commander); enemies.set(enemy.id, unit); }
				pose(unit, gaits.enemies.get(enemy.id) ?? createGait(enemy, mechScale(enemy.kind)), enemy.angle, enemy.hp, state, reducedMotion);
			}
			objects.update(state, reducedMotion);
			reticle.visible = barrel.visible = !attract;
			reticle.position.set(aim.x, 0.25, aim.y);
			const positions = barrelGeometry.getAttribute('position'); const p = state.player;
			positions.setXYZ(0, p.x, 0.25, p.y); positions.setXYZ(1, p.x + Math.cos(p.turret) * 110, 0.25, p.y + Math.sin(p.turret) * 110); positions.needsUpdate = true;
			world.update(0);
			drawOverlay(ctx, width, height, state, aim, { reducedMotion, showRadar: width > 700 && height > 520, gaits, camera, obstructions });
		},
		diagnostics: function () { return { calls: renderer.info.render.calls, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }; },
		dispose,
	};
};
