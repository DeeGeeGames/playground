import { createAudio } from './audio';
import { createSoundObserver } from './audio-events';
import { createEscortPanel } from './escort-panel';
import { attachFullscreen } from './fullscreen';
import { mountGame } from '../../../shared/lifecycle';
import { build, contactWarning, craftCount, durationFor, createState, deploy, ESCORTS, invested, MAX_HULL, notify, pulse, repair, sell, step, upgrade, upgradeCost, waveSide, WEAPONS, WAVE_COUNT, WAVE_NAMES, type Weapon } from './simulation';
import { createPresentation } from './presentation';
import { journeyAt } from './journey';
import { SHIELD_CONFIG } from './systems';

const element = function (id: string): HTMLElement {
	const found = document.getElementById(id); if (!found) throw new Error(`Missing element: ${id}`); return found;
};
const button = function (id: string): HTMLButtonElement {
	const found = element(id); if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing button: ${id}`); return found;
};
const label = function (target: HTMLElement, value: string) { if (target.textContent !== value) target.textContent = value; };
const shutdown = await mountGame('game', async function (container) {
	const canvas = container.querySelector('canvas'); const meter = element('hull-meter');
	if (!canvas || !(meter instanceof HTMLMeterElement)) throw new Error('Missing tactical display');
	const abort = new AbortController(); const options = { signal: abort.signal };
	const ui = {
		hull: element('hull'), salvage: element('salvage'), route: element('route-progress'), routeLabel: element('route-label'), distance: element('distance'),
		wave: element('wave-label'), waveInfo: element('wave-info'), mountTitle: element('mount-title'), mountInfo: element('mount-info'),
		build: element('build-options'), upgradeOptions: element('upgrade-options'), upgrade: button('upgrade'), sell: button('sell'),
		escorts: element('escort-count'), depart: button('depart'), pause: button('pause'), speed: button('speed'), rally: button('rally'),
		pulse: button('pulse'), pulseInfo: element('pulse-info'), pulseState: element('pulse-state'), repair: button('repair'), repairInfo: element('repair-info'),
		brief: element('brief'), pausePanel: element('pause-panel'), result: element('result'), message: element('message'), hint: element('field-hint'), clear: button('clear-target'),
	};
	const mountButtons = Array.from({ length: 8 }, function (_, i) {
		const control = document.createElement('button'); control.type = 'button'; control.setAttribute('aria-label', `Select mount ${i + 1}`);
		control.addEventListener('click', function () { if (available()) { selected = i; rallyMode = false; } }, options);
		element('mounts').append(control); return control;
	});
	const buildButtons = [...container.querySelectorAll<HTMLButtonElement>('[data-build]')];
	const deployButtons = [...container.querySelectorAll<HTMLButtonElement>('[data-deploy]')];
	const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
	const requestedMode = new URLSearchParams(location.search).get('mode');
	let mode = requestedMode === 'systems' ? 'systems' : requestedMode === 'drill' ? 'drill' : 'voyage';
	const newState = function () { return createState(mode === 'voyage' ? {} : { scenario: 'drill', systems: mode === 'systems' }); };
	let state = newState(); let selected = 0; let paused = false; let briefing = true; let rallyMode = false; let speed = 1;
	let frame = 0; let previous = 0; let accumulator = 0; let disposed = false; let contextAvailable = true;
	const pointers = new Map<number, { x: number; y: number; moved: boolean }>();
	let multiTouch = false;
	const available = function () { return contextAvailable && state.focused && !briefing && !paused && (state.status === 'fitting' || state.status === 'running'); };
	const focusCanvas = function () { canvas.focus({ preventScroll: true }); };
	const setPause = function (value: boolean) {
		if (briefing || state.status === 'won' || state.status === 'lost') return;
		if (!value && !contextAvailable) return;
		if (value) { pointers.clear(); multiTouch = false; presentation.cancelInteraction(); }
		audio.setActive(!value && state.focused && !document.hidden && contextAvailable);
		paused = value; state.paused = value; rallyMode = false; accumulator = 0; ui.pausePanel.hidden = !paused;
		if (paused) button('resume').focus({ preventScroll: true }); else focusCanvas();
	};
	const presentation = await createPresentation(canvas);
	const audio = createAudio(); const observeSounds = createSoundObserver();
	let muted = false;
	const syncAudio = function () {
		audio.setActive(!briefing && !paused && state.focused && !document.hidden && contextAvailable);
		for (const sound of observeSounds(state)) audio.play(sound);
	};
	const unlockAudio = function () { void audio.unlock(); };
	container.addEventListener('pointerdown', unlockAudio, { ...options, capture: true });
	container.addEventListener('pointerup', unlockAudio, { ...options, capture: true });
	container.addEventListener('click', unlockAudio, { ...options, capture: true });
	container.addEventListener('keydown', unlockAudio, { ...options, capture: true });
	button('mute').addEventListener('click', function () {
		muted = !muted; audio.setMuted(muted); button('mute').setAttribute('aria-pressed', String(muted));
		label(button('mute'), muted ? 'Sound off' : 'Sound on');
	}, options);
	const detachFullscreen = attachFullscreen(container, button('fullscreen'), element('fullscreen-status'));
	canvas.addEventListener('webglcontextlost', function () { contextAvailable = false; setPause(true); notify(state, 'Graphics interrupted. Voyage paused until the display is restored.'); }, options);
	canvas.addEventListener('webglcontextrestored', function () { contextAvailable = true; notify(state, 'Display restored. Resume when ready.'); }, options);
	button('reset-camera').addEventListener('click', function () { presentation.resetCamera(); focusCanvas(); }, options);
	const restart = function () {
		audio.reset();
		pointers.clear(); multiTouch = false;
		state = newState(); selected = 0; paused = false; briefing = false; rallyMode = false; speed = 1; accumulator = 0;
		ui.pausePanel.hidden = true; ui.result.hidden = true; ui.brief.hidden = true; focusCanvas();
		presentation.resetCamera();
	};
	const order = function (action: () => boolean) {
		if (!available()) return;
		if (!action()) notify(state, 'Order unavailable. Check salvage, capacity, or cooldown.');
		else { syncAudio(); audio.play('order'); }
	};
	const doBuild = function (weapon: Weapon) { order(function () { return build(state, selected, weapon); }); };
	for (const control of buildButtons) control.addEventListener('click', function () {
		const kind = control.dataset['build']; if (kind === 'flak' || kind === 'rail' || kind === 'missile') doBuild(kind);
	}, options);
	for (const control of deployButtons) control.addEventListener('click', function () {
		const kind = control.dataset['deploy']; if (kind === 'interceptor' || kind === 'guardian') order(function () { return deploy(state, kind); });
	}, options);
	ui.upgrade.addEventListener('click', function () { order(function () { return upgrade(state, selected); }); }, options);
	ui.sell.addEventListener('click', function () { order(function () { return sell(state, selected); }); }, options);
	ui.pulse.addEventListener('click', function () { order(function () { return pulse(state); }); }, options);
	ui.repair.addEventListener('click', function () { order(function () { return repair(state); }); }, options);
	ui.depart.addEventListener('click', function () {
		if (!available() || state.status !== 'fitting') return;
		state.status = 'running'; notify(state, 'Underway. First contact on the port flank.'); accumulator = 0; focusCanvas();
	}, options);
	button('prepare').addEventListener('click', function () { briefing = false; ui.brief.hidden = true; focusCanvas(); }, options);
	button('prepare').disabled = false;
	for (const control of container.querySelectorAll<HTMLButtonElement>('[data-mode]')) control.addEventListener('click', function () {
		mode = control.dataset['mode'] === 'systems' ? 'systems' : control.dataset['mode'] === 'drill' ? 'drill' : 'voyage'; restart();
	}, options);
	const escortPanel = createEscortPanel(element('escort-orders'), function () { return state; }, available, abort.signal);
	ui.pause.addEventListener('click', function () { setPause(!paused); }, options);
	button('help').addEventListener('click', function () { setPause(true); }, options);
	button('resume').addEventListener('click', function () { setPause(false); }, options);
	button('restart').addEventListener('click', restart, options); button('restart-pause').addEventListener('click', restart, options);
	ui.speed.addEventListener('click', function () { if (available()) speed = speed === 1 ? 2 : 1; }, options);
	ui.rally.addEventListener('click', function () { if (available()) { rallyMode = !rallyMode; focusCanvas(); } }, options);
	ui.clear.addEventListener('click', function () { if (available()) state.priority = undefined; }, options);
	canvas.addEventListener('pointerdown', function (event) {
		if (event.button !== 0) return;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, moved: false });
		if (pointers.size > 1) multiTouch = true;
	}, options);
	canvas.addEventListener('pointermove', function (event) {
		const start = pointers.get(event.pointerId);
		if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) start.moved = true;
	}, options);
	const releasePointer = function (event: PointerEvent, cancelled: boolean) {
		const start = pointers.get(event.pointerId);
		const gesture = multiTouch;
		pointers.delete(event.pointerId);
		if (pointers.size === 0) multiTouch = false;
		if (!start || start.moved || gesture || cancelled || event.button !== 0 || !available()) return;
		const rect = canvas.getBoundingClientRect();
		const { mount, enemy, world } = presentation.pick({ x: event.clientX - rect.left, y: event.clientY - rect.top }, state);
		if (mount >= 0 && !rallyMode) selected = mount;
		else if (enemy && !rallyMode) { state.priority = enemy.id; notify(state, `Priority target: ${enemy.kind}. Eligible weapons in range and coverage will focus fire.`); }
		else if (world && !state.experimental) { state.rally = { x: Math.max(-450, Math.min(450, world.x)), y: Math.max(-370, Math.min(370, world.y)) }; rallyMode = false; notify(state, 'Escort rally point updated.'); }
		focusCanvas();
	};
	canvas.addEventListener('pointerup', function (event) { releasePointer(event, false); }, options);
	canvas.addEventListener('pointercancel', function (event) { releasePointer(event, true); pointers.clear(); multiTouch = false; presentation.cancelInteraction(); }, options);
	window.addEventListener('pointerup', function (event) { pointers.delete(event.pointerId); if (pointers.size === 0) multiTouch = false; }, options);
	window.addEventListener('keydown', function (event) {
		if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
		// Preserve native keyboard activation when navigating DOM controls.
		if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
		if (event.code === 'Escape' || event.code === 'Space') { event.preventDefault(); setPause(!paused); return; }
		if (!available()) return;
		const index = ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8'].indexOf(event.code);
		if (index >= 0) { selected = index; rallyMode = false; event.preventDefault(); }
		if (event.code === 'KeyQ') { event.preventDefault(); order(function () { return pulse(state); }); }
		if (event.code === 'KeyE') { event.preventDefault(); order(function () { return repair(state); }); }
		if (event.code === 'KeyR' && !state.experimental) { event.preventDefault(); rallyMode = !rallyMode; }
	}, options);
	window.addEventListener('blur', function () { pointers.clear(); multiTouch = false; presentation.cancelInteraction(); state.focused = false; audio.setActive(false); rallyMode = false; setPause(true); }, options);
	document.addEventListener('visibilitychange', function () { if (document.hidden) { pointers.clear(); multiTouch = false; presentation.cancelInteraction(); state.focused = false; audio.setActive(false); rallyMode = false; setPause(true); } }, options);
	window.addEventListener('focus', function () { state.focused = true; }, options);
	document.addEventListener('visibilitychange', function () { if (!document.hidden) state.focused = true; }, options);
	const hud = function () {
		escortPanel();
		const active = available();
		const energyShield = state.systems?.shield;
		element('energy-shield').hidden = !energyShield;
		if (energyShield) {
			const chargeMeter = element('shield-meter');
			if (chargeMeter instanceof HTMLMeterElement) { chargeMeter.max = energyShield.capacity; chargeMeter.value = energyShield.charge; }
			label(element('shield-charge'), `${Math.ceil(energyShield.charge)} / ${energyShield.capacity}`);
			const held = briefing || paused || !state.focused || state.status !== 'running';
			label(element('shield-status'), `${energyShield.charge === 0 ? 'DEPLETED · ' : ''}${held ? 'Recharge held' : energyShield.charge >= energyShield.capacity ? 'Fully charged' : energyShield.rechargeDelay > 0 ? `Recharge in ${Math.ceil(energyShield.rechargeDelay)}s` : `Recharging · +${SHIELD_CONFIG.rechargeRate} / s`}`);
		}
		label(element('purchase-reason'), !active ? 'Commands held' : craftCount(state) >= 9 ? 'Bay full: nine craft slots' : state.salvage < 85 ? 'Insufficient salvage' : state.experimental ? 'Buy wing 85 · ready in bay / Guardian 105' : 'Deploy escorts'); const mount = state.mounts[selected]; if (!mount) return;
		label(ui.hull, `${Math.ceil(state.hull)} / ${MAX_HULL}`); meter.value = state.hull;
		label(ui.salvage, String(Math.floor(state.salvage))); ui.route.style.width = `${Math.min(100, state.time / durationFor(state) * 100)}%`;
		label(ui.distance, `${Math.min(100, Math.floor(state.time / durationFor(state) * 100))}%`);
		const journey = journeyAt(state.time / durationFor(state) * 210);
		label(ui.routeLabel, journey.remaining > 0 ? `KEPLER · ${(journey.remaining / 1000).toFixed(2)} KM` : 'KEPLER · ARRIVED');
		label(ui.wave, state.status === 'fitting' ? (state.systems ? 'SYSTEMS LAB / FITTING' : state.scenario ? 'ESCORT DRILL / FITTING' : 'DRYDOCK / FITTING') : `${state.systems ? 'SYSTEMS · ' : state.scenario ? 'DRILL · ' : ''}CONTACT ${String(state.wave).padStart(2, '0')} / ${state.scenario?.encounters.length ?? 6} ${state.cleared ? '— CLEAR' : ''}`);
		label(ui.waveInfo, state.scenario ? contactWarning(state) : state.status === 'fitting' ? 'Build your defenses. Departure is your call.' : state.wave < WAVE_COUNT ? `Next: ${waveSide(state.wave + 1)} in ${Math.max(0, Math.ceil(state.nextWave - state.time))}s · ${state.enemies.length} hostiles` : state.enemies.length + state.arrivals.length > 0 ? `${state.enemies.length} hostiles · Defeat the gatekeeper and reach the gate.` : 'Passage clear. Approaching Kepler Gate.');
		for (const [i, dot] of [...element('wave-dots').children].entries()) { if (dot instanceof HTMLElement) dot.hidden = !!state.scenario && i >= state.scenario.encounters.length; dot.classList.toggle('current', i + 1 === state.wave); dot.classList.toggle('done', i + 1 < state.wave); }
		for (const [i, control] of mountButtons.entries()) {
			const m = state.mounts[i]; if (!m) continue;
			label(control, `${i + 1} ${m.weapon ? m.weapon === 'flak' ? 'F' : m.weapon === 'rail' ? 'R' : 'M' : '·'}${m.level > 1 ? ` ${'⁺'.repeat(m.level - 1)}` : ''}`);
			control.classList.toggle('selected', selected === i); control.classList.toggle('fitted', !!m.weapon); control.setAttribute('aria-pressed', String(selected === i)); control.disabled = !active;
			control.setAttribute('aria-label', `Mount ${i + 1}, ${m.weapon ? `${WEAPONS[m.weapon].name} level ${m.level}` : 'empty'}`);
		}
		const position = ['AFT', 'MID AFT', 'MID BOW', 'BOW'][selected % 4] ?? '';
		label(ui.mountTitle, `MOUNT 0${selected + 1} / ${selected < 4 ? 'PORT' : 'STARBOARD'} ${position}`);
		label(ui.mountInfo, mount.weapon ? `${WEAPONS[mount.weapon].name} · Level ${mount.level} / 3 · ${Math.round(WEAPONS[mount.weapon].range * (1 + (mount.level - 1) * 0.12))}m range` : 'Empty hardpoint');
		label(ui.mountInfo, ui.mountInfo.textContent + (state.coverageDegrees < 360 ? ` · ${state.coverageDegrees}° outward coverage` : ' · full firing arc'));
		ui.build.hidden = !!mount.weapon; ui.upgradeOptions.hidden = !mount.weapon;
		label(ui.upgrade, mount.level >= 3 ? 'FULLY UPGRADED' : `UPGRADE TO LV ${mount.level + 1} · ${upgradeCost(mount)}`);
		ui.upgrade.disabled = !active || mount.level >= 3 || state.salvage < upgradeCost(mount);
		ui.upgrade.title = '+55% base damage, +12% range and firing speed per level';
		label(ui.sell, `Salvage weapon · +${Math.floor(invested(mount) * 0.7)}`); ui.sell.disabled = !active;
		for (const control of buildButtons) { const kind = control.dataset['build']; if (kind === 'flak' || kind === 'rail' || kind === 'missile') { control.disabled = !active || state.salvage < WEAPONS[kind].cost; control.title = WEAPONS[kind].description; } }
		for (const control of deployButtons) {
			const kind = control.dataset['deploy']; if (kind !== 'interceptor' && kind !== 'guardian') continue;
			const reason = !active ? 'Commands held' : craftCount(state) + ESCORTS[kind].count > 9 ? `Needs ${ESCORTS[kind].count} free slots` : state.salvage < ESCORTS[kind].cost ? 'Insufficient salvage' : '';
			control.disabled = !!reason;
			const detail = control.querySelector('small'); if (detail) label(detail, reason || (kind === 'interceptor' ? state.experimental ? 'Buy 3 ready fighters' : '3 fighters · fragile, fast' : '1 gunship · draws enemy fire'));
		}
		label(ui.escorts, `${craftCount(state)} / 9 CRAFT`);
		const canvasHelp = `Tactical view. Click a numbered mount to build. Click an enemy for turret priority. ${state.experimental ? 'Use the escort bay sector buttons to scramble wings and assign guardians.' : 'Click empty space to rally escorts.'} Right-drag or touch-drag to orbit; wheel or pinch to zoom. Use the command panel for keyboard-accessible orders.`;
		if (canvas.getAttribute('aria-label') !== canvasHelp) canvas.setAttribute('aria-label', canvasHelp);
		label(ui.depart, state.systems ? 'START SYSTEMS LAB →' : state.scenario ? 'START ESCORT DRILL →' : 'DEPART FOR KEPLER →');
		label(button('restart-pause'), state.systems ? 'Restart Systems Lab' : state.scenario ? 'Restart drill' : 'Restart voyage');
		label(button('restart'), state.systems ? 'RETRY SYSTEMS LAB →' : state.scenario ? 'RETRY ESCORT DRILL →' : 'ANOTHER VOYAGE →');
		ui.depart.hidden = state.status !== 'fitting'; ui.depart.disabled = !active || (!state.mounts.some(function (m) { return !!m.weapon; }) && craftCount(state) === 0);
		ui.depart.title = ui.depart.disabled ? 'Build a turret or deploy an escort before departure.' : 'Begin the voyage';
		ui.pulse.disabled = !active || state.status !== 'running' || state.pulseCooldown > 0;
		label(ui.pulseState, state.pulseCooldown > 0 ? `${Math.ceil(state.pulseCooldown)}s` : 'READY');
		label(ui.pulseInfo, state.aegisRemaining > 0 ? `Aegis · ${Math.ceil(state.aegisRemaining)}s hull protection` : 'Clear rounds · 5s hull protection');
		ui.repair.disabled = !active || state.salvage < 80 || state.hull >= MAX_HULL || state.repairCooldown > 0;
		label(ui.repairInfo, state.repairCooldown > 0 ? `Crews working · ${Math.ceil(state.repairCooldown)}s` : '+240 hull · 15s cooldown');
		ui.rally.hidden = state.experimental; label(element('escort-help'), state.experimental ? 'Buy ready wings, then scramble a sector. Guardians hold their own sector. Reserve craft count toward nine slots.' : 'Escorts engage near their shared rally point.'); ui.rally.disabled = !active; ui.rally.classList.toggle('active', rallyMode); ui.rally.setAttribute('aria-pressed', String(rallyMode));
		label(ui.rally, rallyMode ? 'Click space to place rally point' : '⌖ Set escort rally point');
		ui.clear.hidden = state.priority === undefined; ui.clear.disabled = !active;
		label(ui.hint, state.experimental ? 'Select a mount for coverage · Click hostile for turret priority · Order escorts in bay' : rallyMode ? 'RALLY MODE · Click or tap a location for all escorts' : state.priority !== undefined ? 'PRIORITY LOCK · Weapons focus the marked hostile when in range' : 'Click mount to build · Click empty space to rally · Click hostile to focus');
		label(ui.message, state.messageTime > 0 ? state.message : ''); label(ui.speed, `${speed}×`); ui.speed.disabled = !active;
		label(ui.pause, paused ? '▶ Resume' : 'Ⅱ Pause'); ui.pause.disabled = briefing || state.status === 'won' || state.status === 'lost';
	};
	const showResult = function () {
		ui.result.hidden = false; rallyMode = false; pointers.clear(); multiTouch = false; presentation.cancelInteraction();
		label(element('result-title'), state.systems ? state.status === 'won' ? 'SYSTEMS LAB SURVIVED.' : 'SYSTEMS LAB LOST.' : state.scenario ? state.status === 'won' ? 'DRILL SURVIVED.' : 'DRILL LOST.' : state.status === 'won' ? 'THE ARK ARRIVES.' : 'THE LIGHTS GO OUT.');
		label(element('result-copy'), state.scenario ? 'Compare your coverage, launch timing and guardian assignments. Restart to try another defense.' : state.status === 'won' ? 'Kepler Gate opens. Your moving fortress brought its people home.' : 'The passage claimed another ship. Cover both flanks, use railguns against armor, and launch escorts to draw fire.');
		label(element('result-stats'), `${Math.min(100, Math.floor(state.time / durationFor(state) * 100))}% of route · ${state.kills} hostiles destroyed · ${Math.ceil(state.hull / MAX_HULL * 100)}% hull remaining · ${state.escortLosses} escorts lost · ${state.launches} launches · ${state.orders} escort orders · ${Math.floor(state.salvage)} salvage · ${state.systems ? `Systems Lab · ${Math.round(state.systems.shieldAbsorbed)} shield damage absorbed` : state.scenario ? 'Escort Drill' : WAVE_NAMES[Math.max(0, state.wave - 1)] ?? ''}`);
		button('restart').focus({ preventScroll: true });
	};
	const tick = function (now: number) {
		if (disposed) return;
		const elapsed = previous ? Math.min(0.1, (now - previous) / 1000) : 0; previous = now;
		if (available() && state.status === 'running' && !document.hidden) {
			accumulator += elapsed * speed;
			while (accumulator >= 1 / 60 && state.status === 'running') { step(state, 1 / 60); syncAudio(); accumulator -= 1 / 60; if (state.status !== 'running') showResult(); }
		} else accumulator = 0;
		if (contextAvailable) presentation.render(state, selected, reducedMotion.matches, rallyMode, !briefing && !paused && (state.status === 'fitting' || state.status === 'running'));
		syncAudio(); hud();
		frame = requestAnimationFrame(tick);
	};
	frame = requestAnimationFrame(tick);
	return function () { disposed = true; cancelAnimationFrame(frame); abort.abort(); detachFullscreen(); pointers.clear(); presentation.dispose(); void audio.dispose(); };
});
if (import.meta.hot) import.meta.hot.dispose(shutdown);
