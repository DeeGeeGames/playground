import ECSpresso from 'ecspresso';
import { createGroupComponents, createRenderer3DPlugin } from 'ecspresso/plugins/rendering/renderer3D';
import { Color, DirectionalLight, GridHelper, HemisphereLight, Mesh, MeshStandardMaterial, OrthographicCamera, PlaneGeometry, Scene, WebGLRenderer } from 'three';
import { createMech } from './mech-3d';
import { alignCamera } from './projection-3d';
import type { WalkerGait } from './gait';
import type { State } from './simulation';

export const createMechPresentation = async function (canvas: HTMLCanvasElement) {
	const renderer = new WebGLRenderer({ canvas, antialias: true });
	const scene = new Scene(); scene.background = new Color('#172630');
	const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 6000);
	const model = createMech();
	const floorGeometry = new PlaneGeometry(1800, 1200);
	const floorMaterial = new MeshStandardMaterial({ color: '#303c41', roughness: 1 });
	const floor = new Mesh(floorGeometry, floorMaterial);
	floor.rotation.x = -Math.PI / 2; floor.position.set(900, -0.1, 600); scene.add(floor);
	const grid = new GridHelper(1800, 15, '#405056', '#405056'); grid.position.set(900, 0, 600); scene.add(grid);
	scene.add(new HemisphereLight('#dce9f2', '#26323a', 2));
	const sun = new DirectionalLight('#fff1d8', 2.4); sun.position.set(-300, 800, 500); scene.add(sun);
	const world = ECSpresso.create().withPlugin(createRenderer3DPlugin({ renderer, scene, camera, startLoop: false })).build();
	let disposed = false;
	const dispose = async function () {
		if (disposed) return; disposed = true;
		try { await world.dispose(); }
		finally {
			model.dispose(); floorGeometry.dispose(); floorMaterial.dispose(); grid.geometry.dispose();
			for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) material.dispose();
			scene.clear(); renderer.dispose(); renderer.forceContextLoss();
		}
	};
	try { await world.initialize(); }
	catch (error: unknown) { await dispose(); throw error; }
	const entity = world.spawn(createGroupComponents(model.root));
	return {
		render: function (state: State, gait: WalkerGait, width: number, height: number, magnification: number) {
			if (disposed || width <= 0 || height <= 0) return;
			const dpr = Math.min(devicePixelRatio, 2);
			if (renderer.getPixelRatio() !== dpr || canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
				renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
			}
			alignCamera(camera, width / magnification, height / magnification, state);
			const transform = entity.components.localTransform3D;
			transform.x = gait.body.x; transform.z = gait.body.y;
			world.markChanged(entity.id, 'localTransform3D');
			model.pose(gait, state.player.turret); world.update(0);
		},
		dispose,
	};
};
