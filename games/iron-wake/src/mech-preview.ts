import { createGaits, advanceGaits } from './gait';
import { createMechPresentation } from './mech-presentation';
import { render } from './render';
import { createState, step } from './simulation';

const degrees = function (angle: number) { return ((angle * 180 / Math.PI) % 360 + 360) % 360; };
export const startMechPreview = async function (container: HTMLElement) {
	container.classList.add('mech-preview');
	container.innerHTML = `
		<header class="preview-header"><a href="./">← Iron Wake</a><span>FRAME 08 / PRESENTATION TRIAL</span></header>
		<div class="preview-intro"><h1>One frame. Two renderers.</h1><p>Compare the same pose and planted-foot gait. Review the silhouette, cockpit and weapon pods through a complete rotation.</p></div>
		<div class="preview-views">
			<section><h2>Current Canvas <small>REFERENCE</small></h2><canvas id="preview-canvas" aria-label="Current Canvas mech presentation"></canvas></section>
			<section><h2>ECSpresso 3D <small>PROTOTYPE</small></h2><canvas id="preview-three" aria-label="Orthographic 3D mech presentation"></canvas></section>
		</div>
		<form class="preview-controls" aria-label="Mech presentation controls">
			<label>Hull heading <input id="preview-hull" type="range" min="0" max="360" value="45"><output id="preview-hull-value">45°</output></label>
			<label>Turret heading <input id="preview-turret" type="range" min="0" max="360" value="45"><output id="preview-turret-value">45°</output></label>
			<label>Movement <select id="preview-motion"><option value="parked">Parked</option><option value="walk">Walk forward</option><option value="reverse">Reverse</option><option value="turn">Turn in place</option></select></label>
			<label class="preview-check"><input id="preview-spin" type="checkbox"> Rotate turret</label>
			<button id="preview-pause" type="button">Pause</button><button id="preview-reset" type="button">Reset pose</button>
		</form>
		<footer class="preview-footer"><output id="preview-timing">Measuring render submission…</output><p id="preview-status" role="status">The world migration waits for review of this mech. The playable game retains its current renderer.</p><p id="error" role="alert" hidden></p></footer>`;
	const get = function (id: string) {
		const node = container.querySelector(`#${id}`); if (!(node instanceof HTMLElement)) throw new Error(`Missing preview element: ${id}`); return node;
	};
	const input = function (id: string) { const node = get(id); if (!(node instanceof HTMLInputElement)) throw new Error(`Invalid preview input: ${id}`); return node; };
	const canvas = get('preview-canvas'); const threeCanvas = get('preview-three'); const motion = get('preview-motion');
	if (!(canvas instanceof HTMLCanvasElement) || !(threeCanvas instanceof HTMLCanvasElement) || !(motion instanceof HTMLSelectElement)) throw new Error('Invalid preview surface');
	const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable');
	const presentation = await createMechPresentation(threeCanvas);
	const abort = new AbortController(); const options = { signal: abort.signal };
	const hull = input('preview-hull'); const turret = input('preview-turret'); const spin = input('preview-spin');
	const pauseButton = get('preview-pause'); const status = get('preview-status'); const timing = get('preview-timing');
	const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
	const initialState = function () {
		const state = createState(); state.spawnIn = Infinity;
		state.player.angle = Math.PI / 4; state.player.turret = Math.PI / 4; return state;
	};
	let state = initialState(); let gaits = createGaits(state);
	let heading = Math.PI / 4; let paused = reducedMotion.matches; let lost = false; let disposed = false;
	let frame = 0; let previous = 0; let accumulator = 0; let frames = 0;
	let canvasSamples: number[] = []; let threeSamples: number[] = [];
	spin.checked = !reducedMotion.matches;
	if (!reducedMotion.matches) motion.value = 'walk';
	const sync = function () {
		pauseButton.textContent = paused ? 'Resume' : 'Pause'; pauseButton.setAttribute('aria-pressed', String(paused));
		hull.value = String(degrees(state.player.angle)); turret.value = String(degrees(heading));
		get('preview-hull-value').textContent = `${Math.round(degrees(state.player.angle))}°`;
		get('preview-turret-value').textContent = `${Math.round(degrees(state.player.turret))}°`;
		container.dataset['previewTime'] = state.time.toFixed(4);
	};
	const setPaused = function (value: boolean) { paused = value; accumulator = 0; sync(); };
	hull.addEventListener('input', function () {
		state.player.angle = Number(hull.value) * Math.PI / 180;
		// Manual inspection changes the hull without teleporting stance feet.
		gaits = { ...gaits, player: { ...gaits.player, body: { ...gaits.player.body, angle: state.player.angle } } }; sync();
	}, options);
	turret.addEventListener('input', function () {
		spin.checked = false; heading = Number(turret.value) * Math.PI / 180; state.player.turret = heading; sync();
	}, options);
	pauseButton.addEventListener('click', function () { if (!lost) setPaused(!paused); }, options);
	get('preview-reset').addEventListener('click', function () {
		state = initialState(); gaits = createGaits(state); heading = Math.PI / 4; accumulator = 0;
		motion.value = 'parked'; spin.checked = false; sync();
	}, options);
	container.querySelector('form')?.addEventListener('submit', function (event) { event.preventDefault(); }, options);
	window.addEventListener('keydown', function (event) { if (event.code === 'Escape' && !event.repeat) setPaused(true); }, options);
	window.addEventListener('blur', function () { setPaused(true); }, options);
	document.addEventListener('visibilitychange', function () { if (document.hidden) setPaused(true); }, options);
	reducedMotion.addEventListener('change', function () { if (reducedMotion.matches) { spin.checked = false; setPaused(true); } }, options);
	threeCanvas.addEventListener('webglcontextlost', function (event) {
		event.preventDefault(); lost = true; setPaused(true); status.textContent = '3D context lost. Waiting for recovery.';
	}, options);
	threeCanvas.addEventListener('webglcontextrestored', function () {
		lost = false; status.textContent = '3D context restored. Resume when ready.';
	}, options);
	const measure = function (samples: readonly number[]) {
		const sorted = [...samples].sort(function (a, b) { return a - b; });
		return `${(sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(2)} / ${(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(2)} ms`;
	};
	const tick = function (now: number) {
		if (disposed) return;
		const elapsed = previous ? Math.min((now - previous) / 1000, 0.1) : 0; previous = now;
		if (!paused && !lost && !document.hidden) {
			accumulator += elapsed;
			while (accumulator >= 1 / 60) {
				if (spin.checked) heading += 1 / 60 * 0.6;
				step(state, { drive: motion.value === 'walk' ? 1 : motion.value === 'reverse' ? -1 : 0, stop: motion.value === 'parked' || motion.value === 'turn', turn: motion.value === 'turn' ? 1 : 0,
					aim: { x: state.player.x + Math.cos(heading) * 1000, y: state.player.y + Math.sin(heading) * 1000 }, cannon: false, laser: false, missile: false, coolant: false }, 1 / 60);
				gaits = advanceGaits(gaits, state); accumulator -= 1 / 60;
			}
		}
		const rect = canvas.getBoundingClientRect(); const width = rect.width; const height = rect.height;
		if (width > 0 && height > 0) {
			const dpr = Math.min(devicePixelRatio, 2); const magnification = Math.min(3, width / 150, height / 150);
			if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
			ctx.setTransform(dpr * magnification, 0, 0, dpr * magnification, 0, 0);
			const before = performance.now();
			render(ctx, width / magnification, height / magnification, state, state.player, { reducedMotion: true, showRadar: false, gaits });
			const between = performance.now();
			if (!lost) presentation.render(state, gaits.player, width, height, magnification);
			canvasSamples.push(between - before); threeSamples.push(performance.now() - between);
			if (++frames % 120 === 0) {
				timing.textContent = `CPU submission · median / p95 · Canvas ${measure(canvasSamples)} · 3D ${measure(threeSamples)} (includes ECS; excludes GPU time)`;
				canvasSamples = []; threeSamples = [];
			}
		}
		sync(); frame = requestAnimationFrame(tick);
	};
	sync(); frame = requestAnimationFrame(tick);
	return async function () {
		if (disposed) return; disposed = true; cancelAnimationFrame(frame); abort.abort();
		await presentation.dispose();
	};
};
