import { OrthographicCamera } from 'three';
import { cameraFor } from './projection';
import type { State } from './simulation';

// Three uses (ground X, elevation, ground Y). This basis reproduces the
// existing Canvas projection, including its elevation and 52% ground anchor.
export const alignCamera = function (camera: OrthographicCamera, width: number, height: number, state: State) {
	const scale = cameraFor(width, height, state).scale * Math.sqrt(3 / 2);
	camera.left = -width / (2 * scale); camera.right = width / (2 * scale);
	camera.top = height * 0.52 / scale; camera.bottom = -height * 0.48 / scale;
	camera.position.set(state.player.x + 1000, 1000, state.player.y + 1000);
	camera.lookAt(state.player.x, 0, state.player.y);
	camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
};
