import { mountGame } from '../../../shared/lifecycle';
import { createState, distance, step, type Controls, type State } from './simulation';
import { render } from './render';
import { cameraFor, screenToWorld, worldToScreen } from './projection';
import { createAudio } from './audio';

const element = function (id: string): HTMLElement {
	const value = document.getElementById(id);
	if (!(value instanceof HTMLElement)) throw new Error(`Missing cockpit element: ${id}`);
	return value;
};
const bindings = new Map([
	['KeyW', 'forward'], ['ArrowUp', 'forward'], ['KeyS', 'back'], ['ArrowDown', 'back'],
	['KeyA', 'left'], ['ArrowLeft', 'left'], ['KeyD', 'right'], ['ArrowRight', 'right'],
	['KeyX', 'stop'], ['Space', 'cannon'], ['KeyE', 'laser'], ['KeyQ', 'missile'], ['KeyV', 'coolant'],
]);
const formatTime = function (time: number) { return `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}`; };
const shutdown = await mountGame('game', async function (container) {
	const canvas = container.querySelector('canvas');
	if (!canvas) throw new Error('Missing battlefield');
	canvas.tabIndex = 0;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas unavailable');
	const audio = createAudio();
	const abort = new AbortController(); const listenerOptions = { signal: abort.signal };
	const keys = new Set<string>(); const pending = new Set<string>(); const held = new Map<number, string>();
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	const ui = {
		phase: element('phase'), status: element('status'), armor: element('armor-value'), armorFill: element('armor-fill'),
		relay: element('relay-value'), relayFill: element('relay-fill'), heat: element('heat-value'), heatFill: element('heat-fill'),
		drive: element('drive-value'), throttleFill: element('throttle-fill'), speed: element('speed-value'),
		cannon: element('cannon-status'), cannonFill: element('cannon-fill'), laser: element('laser-status'), laserFill: element('laser-fill'),
		missile: element('missile-status'), missileFill: element('missile-fill'), coolant: element('coolant-value'), message: element('message'),
		brief: element('brief'), pause: element('pause-panel'), result: element('result'), pauseButton: element('pause'), sound: element('sound'),
	};
	let selectedWeapon: 'cannon' | 'laser' | 'missile' = 'cannon';
	const mousePointers = new Set<number>();
	let mousePressed = false;
	let state = createState(); let running = false; let paused = false; let muted = false;
	let aim = { x: 900, y: 450 }; let pointer: { x: number; y: number } | undefined;
	let frame = 0; let previous = 0; let accumulator = 0; let lastOutcome: State['outcome'] = 'playing';
	let message = ''; let messageUntil = 0; let terminalUntil = 0; let audioAvailable = true;
	const resetInput = function () { keys.clear(); pending.clear(); held.clear(); mousePointers.clear(); mousePressed = false; };
	const active = function (action: string) { return ((mousePointers.size > 0 || mousePressed) && action === selectedWeapon) || keys.has(action) || pending.has(action) || [...held.values()].includes(action); };
	const unlockSound = function () {
		void audio.unlock().then(function (available) {
			audioAvailable = available;
			if (!available) { ui.sound.textContent = 'Audio unavailable'; ui.sound.setAttribute('aria-disabled', 'true'); }
		});
	};
	const syncMenu = function () {
		ui.brief.hidden = running;
		ui.pause.hidden = !paused;
		ui.result.hidden = !running || state.outcome === 'playing';
		container.classList.toggle('modal-open', !running || paused || state.outcome !== 'playing');
		ui.pauseButton.textContent = paused ? 'Resume · Esc' : 'Pause · Esc';
		ui.pauseButton.setAttribute('aria-disabled', String(!running || state.outcome !== 'playing'));
	};
	const start = function () {
		state = createState(); selectedWeapon = 'cannon'; running = true; paused = false; lastOutcome = 'playing';
		aim = { x: 900, y: 450 }; pointer = undefined; message = 'SYSTEMS ONLINE / DEFEND RELAY 09'; messageUntil = 4;
		resetInput(); accumulator = 0; terminalUntil = 0; syncMenu(); canvas.focus({ preventScroll: true }); unlockSound();
	};
	const setPaused = function (value: boolean) {
		if (!running || state.outcome !== 'playing') return;
		paused = value; resetInput(); accumulator = 0; syncMenu();
		if (paused) { audio.update({ speed: 0, laser: false, heat: 0, active: false }); element('resume').focus({ preventScroll: true }); }
		else { canvas.focus({ preventScroll: true }); unlockSound(); }
	};
	element('start').addEventListener('click', start, listenerOptions);
	element('restart').addEventListener('click', start, listenerOptions);
	element('reset').addEventListener('click', start, listenerOptions);
	element('resume').addEventListener('click', function () { setPaused(false); }, listenerOptions);
	ui.pauseButton.addEventListener('click', function () { setPaused(!paused); }, listenerOptions);
	ui.sound.addEventListener('click', function () {
		if (!audioAvailable) return;
		muted = !muted; audio.setMuted(muted); ui.sound.textContent = muted ? 'Sound off' : 'Sound on';
		ui.sound.setAttribute('aria-pressed', String(muted)); if (!muted) unlockSound();
		if (running && !paused && state.outcome === 'playing') canvas.focus({ preventScroll: true });
	}, listenerOptions);
	window.addEventListener('keydown', function (event) {
		if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) setPaused(!paused); return; }
		const action = bindings.get(event.code);
		if (!action || !running || paused || state.outcome !== 'playing') return;
		if (event.target instanceof HTMLButtonElement && event.code === 'Space') return;
		event.preventDefault(); keys.add(action); if (!event.repeat) pending.add(action);
	}, listenerOptions);
	window.addEventListener('keyup', function (event) { const action = bindings.get(event.code); if (action) keys.delete(action); }, listenerOptions);
	window.addEventListener('blur', function () { resetInput(); setPaused(true); }, listenerOptions);
	document.addEventListener('visibilitychange', function () {
		if (document.hidden) { resetInput(); setPaused(true); audio.update({ speed: 0, laser: false, heat: 0, active: false }); }
	}, listenerOptions);
	const updatePointer = function (event: PointerEvent) {
		if (paused || !running || state.outcome !== 'playing') return;
		const rect = canvas.getBoundingClientRect(); pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
	};
	canvas.addEventListener('pointermove', updatePointer, listenerOptions);
	canvas.addEventListener('wheel', function (event) {
		if (!running || paused || state.outcome !== 'playing' || event.ctrlKey || event.deltaY === 0) return;
		event.preventDefault();
		if (event.deltaY > 0) selectedWeapon = selectedWeapon === 'cannon' ? 'laser' : selectedWeapon === 'laser' ? 'missile' : 'cannon';
		else selectedWeapon = selectedWeapon === 'cannon' ? 'missile' : selectedWeapon === 'missile' ? 'laser' : 'cannon';
	}, { ...listenerOptions, passive: false });
	canvas.addEventListener('pointerdown', function (event) {
		if ((!event.isPrimary && event.pointerType !== 'touch') || event.button !== 0 || paused || !running || state.outcome !== 'playing') return;
		updatePointer(event); canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId);
		if (event.pointerType !== 'touch') { mousePointers.add(event.pointerId); mousePressed = true; }
	}, listenerOptions);
	const release = function (event: PointerEvent) { held.delete(event.pointerId); mousePointers.delete(event.pointerId); };
	window.addEventListener('pointerup', release, listenerOptions);
	window.addEventListener('pointercancel', release, listenerOptions);
	canvas.addEventListener('lostpointercapture', release, listenerOptions);
	for (const button of container.querySelectorAll<HTMLButtonElement>('[data-control], [data-weapon]')) {
		button.addEventListener('pointerdown', function (event) {
			if (!running || paused || state.outcome !== 'playing' || event.button !== 0) return;
			const action = button.dataset['control'] ?? button.dataset['weapon']; if (!action) return;
			event.preventDefault(); button.setPointerCapture(event.pointerId); held.set(event.pointerId, action); pending.add(action);
		}, listenerOptions);
		button.addEventListener('lostpointercapture', release, listenerOptions);
	}
	const weaponState = function (label: HTMLElement, fill: HTMLElement, cooldown: number, duration: number, firing: boolean) {
		label.textContent = state.player.overheated ? 'HEAT LOCK' : cooldown > 0 ? `${cooldown.toFixed(1)}s` : firing ? 'FIRING' : 'READY';
		fill.style.width = `${Math.max(0, 1 - cooldown / duration) * 100}%`;
		label.closest('button')?.classList.toggle('firing', firing && !state.player.overheated);
		label.closest('button')?.classList.toggle('locked', state.player.overheated);
	};
	const updateHud = function () {
		const p = state.player;
		for (const button of container.querySelectorAll<HTMLButtonElement>('[data-weapon]')) {
			const selected = button.dataset['weapon'] === selectedWeapon;
			button.classList.toggle('selected', selected);
			if (button.classList.contains('weapon')) button.setAttribute('aria-current', String(selected));
		}
		ui.phase.textContent = paused ? 'OPERATION PAUSED' : `WAVE 0${state.wave} / 03`;
		ui.status.textContent = !running ? 'Hold the uplink. Survive three waves.' : state.intermission > 0 ? 'Sector clear. Resupply incoming.' : `${state.enemies.length} active · ${state.warnings.length} inbound · ${state.kills}/21 eliminated`;
		ui.armor.textContent = `${Math.max(0, Math.ceil(p.hp))}%`; ui.armorFill.style.width = `${Math.max(0, p.hp)}%`;
		ui.armorFill.style.background = p.hp < 30 ? 'var(--danger)' : 'var(--cyan)';
		ui.relay.textContent = `${Math.max(0, state.relay)}%`; ui.relayFill.style.width = `${Math.max(0, state.relay)}%`;
		ui.heat.textContent = p.overheated ? 'LOCKOUT' : `${Math.ceil(p.heat)}%`; ui.heatFill.style.width = `${p.heat}%`;
		ui.heatFill.style.background = p.heat > 80 ? 'var(--danger)' : 'var(--amber)';
		ui.drive.textContent = `${p.throttle < -0.005 ? 'REV' : p.throttle > 0.005 ? 'FWD' : 'NEUTRAL'} ${Math.round(Math.abs(p.throttle) * 100)}%`;
		ui.throttleFill.style.left = `${p.throttle < 0 ? 50 + p.throttle * 50 : 50}%`; ui.throttleFill.style.width = `${Math.abs(p.throttle) * 50}%`;
		ui.speed.textContent = `SPEED ${Math.round(p.speed / (p.speed < 0 ? 48 : 90) * 100)}%`;
		weaponState(ui.cannon, ui.cannonFill, state.cannonIn, 0.65, active('cannon'));
		weaponState(ui.missile, ui.missileFill, state.missileIn, 4.5, active('missile'));
		weaponState(ui.laser, ui.laserFill, 0, 1, !!state.beam); ui.coolant.textContent = String(state.coolantCharges);
		ui.message.textContent = paused || !running || state.outcome !== 'playing' ? '' : p.overheated ? 'REACTOR LOCKOUT / V TO PURGE' : state.time < messageUntil ? message : state.relay < 30 ? 'RELAY INTEGRITY CRITICAL' : '';
	};
	const tick = function (now: number) {
		const elapsed = previous ? Math.min((now - previous) / 1000, 0.1) : 0; previous = now;
		const rect = canvas.getBoundingClientRect(); const width = rect.width; const height = rect.height;
		const dpr = Math.min(devicePixelRatio, 2);
		if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const camera = cameraFor(width, height, state);
		if (pointer && !paused) {
			aim = screenToWorld(pointer, camera);
			const cursor = pointer;
			const picked = [...state.enemies].sort(function (a, b) { return distance(worldToScreen(a, camera, 45), cursor) - distance(worldToScreen(b, camera, 45), cursor); })[0];
			if (picked && distance(worldToScreen(picked, camera, 45), cursor) < 42 * camera.scale) aim = { x: picked.x, y: picked.y };
		}
		const makeInput = function (): Controls { return { drive: Number(active('forward')) - Number(active('back')), stop: active('stop'), turn: Number(active('right')) - Number(active('left')), aim, cannon: active('cannon'), laser: active('laser'), missile: active('missile'), coolant: active('coolant') }; };
		if (running && !paused && !document.hidden && state.outcome === 'playing') {
			accumulator += elapsed;
			while (accumulator >= 1 / 60 && state.outcome === 'playing') {
				step(state, makeInput(), 1 / 60); pending.clear(); mousePressed = false; accumulator -= 1 / 60;
				audio.update({ speed: state.player.speed, laser: !!state.beam, heat: state.player.heat, active: true }); audio.play(state.events);
				if (state.events.includes('pickup')) { message = 'SALVAGE RECOVERED'; messageUntil = state.time + 2.5; }
				if (state.events.includes('wave')) { message = state.wave === 1 ? 'HOSTILE SIGNALS / CHECK TACTICAL RADAR' : 'ARMOR REPAIRED / COOLANT RESUPPLIED'; messageUntil = state.time + 4; }
				if (state.events.includes('coolant')) { message = 'COOLANT PURGE / REACTOR STABILIZING'; messageUntil = state.time + 2; }
				if (lastOutcome === 'playing' && state.outcome !== 'playing') { terminalUntil = now + 1400; lastOutcome = state.outcome; resetInput(); syncMenu(); element('restart').focus({ preventScroll: true }); }
			}
		}
		if (state.outcome !== 'playing') {
			element('result-title').textContent = state.outcome === 'won' ? 'Signal unbroken.' : 'Signal lost.';
			element('result-copy').textContent = state.outcome === 'won' ? 'All assault waves neutralized. Relay 09 is still transmitting. Bring the frame home.' : state.player.hp <= 0 ? 'Siege frame destroyed. Keep an eye on armor and recover repair salvage.' : 'The uplink has fallen. Use the radar to intercept siege units before they close in.';
			element('result-stats').textContent = `HOSTILES ${state.kills} / 21 · TIME ${formatTime(state.time)} · RELAY ${Math.max(0, state.relay)}%`;
		}
		const engaged = running && !paused && !document.hidden && (state.outcome === 'playing' || now < terminalUntil);
		audio.update({ speed: state.outcome === 'playing' ? state.player.speed : 0, laser: state.outcome === 'playing' && !!state.beam, heat: state.player.heat, active: engaged });
		render(ctx, width, height, state, aim, { reducedMotion: reducedMotion.matches, showRadar: width > 700 && height > 520 }); updateHud();
		frame = requestAnimationFrame(tick);
	};
	syncMenu(); frame = requestAnimationFrame(tick);
	return async function () { cancelAnimationFrame(frame); abort.abort(); resetInput(); await audio.dispose(); };
});
if (import.meta.hot) import.meta.hot.dispose(shutdown);
