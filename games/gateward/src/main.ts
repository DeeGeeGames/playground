import { createAudio } from './audio';
import { createSoundObserver } from './audio-events';
import { createEscortPanel } from './escort-panel';
import { attachFullscreen } from './fullscreen';
import { mountGame } from '../../../shared/lifecycle';
import { build, contactWarning, craftCount, createState, deploy, interdictionReason, placeInterdiction, ESCORTS, invested, MAX_HULL, notify, pulse, repair, repairSensors, setPriority, setRally, sell, step, upgrade, upgradeCost, WEAPONS, type Point, type Weapon } from './simulation';
import { worldPoint } from './space';
import { createPresentation } from './presentation';
import { journeyFor } from './journey';
import { createEngineeringPanel } from './engineering-panel';
import { powerOutputs } from './systems';
import { contactIntel, SENSOR_CONFIG, sensorRanges } from './sensors';
import { createInterdictionPanel } from './interdiction-panel';
import { systemsResultMessage, systemsSummary } from './trial-summary';

const element = function (id: string): HTMLElement {
	const found = document.getElementById(id); if (!found) throw new Error(`Missing element: ${id}`); return found;
};
const button = function (id: string): HTMLButtonElement {
	const found = element(id); if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing button: ${id}`); return found;
};
const label = function (target: HTMLElement, value: string) { if (target.textContent !== value) target.textContent = value; };
const clockTime = function (seconds: number): string { const total = Math.max(0, Math.floor(seconds + 1e-8)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; };
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
		control.addEventListener('click', function () { if (available()) { selected = i; rallyMode = false; placement = undefined; } }, options);
		element('mounts').append(control); return control;
	});
	const buildButtons = [...container.querySelectorAll<HTMLButtonElement>('[data-build]')];
	const deployButtons = [...container.querySelectorAll<HTMLButtonElement>('[data-deploy]')];
	const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
	const requestedMode = new URLSearchParams(location.search).get('mode');
	let mode = requestedMode === 'systems' ? 'systems' : requestedMode === 'drill' ? 'drill' : 'voyage';
	const newState = function () { return createState(mode === 'systems' ? { scenario: 'systems' } : mode === 'drill' ? { scenario: 'drill' } : {}); };
	let state = newState(); let selected = 0; let paused = false; let briefing = true; let rallyMode = false; let speed = 1;
	let placement: Point | undefined;
	let frame = 0; let previous = 0; let accumulator = 0; let disposed = false; let contextAvailable = true;
	const pointers = new Map<number, { x: number; y: number; moved: boolean }>();
	let multiTouch = false; let engineeringFirst = false;
	const available = function () { return contextAvailable && state.focused && !briefing && !paused && (state.status === 'fitting' || state.status === 'running'); };
	const focusCanvas = function () { canvas.focus({ preventScroll: true }); };
	const setPause = function (value: boolean) {
		if (briefing || state.status === 'won' || state.status === 'lost') return;
		if (!value && !contextAvailable) return;
		if (value) { pointers.clear(); multiTouch = false; presentation.cancelInteraction(); }
		audio.setActive(!value && state.focused && !document.hidden && contextAvailable);
		paused = value; state.paused = value; rallyMode = false; placement = undefined; accumulator = 0; ui.pausePanel.hidden = !paused;
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
		placement = undefined; state = newState(); selected = 0; paused = false; briefing = false; rallyMode = false; speed = 1; accumulator = 0;
		ui.pausePanel.hidden = true; ui.result.hidden = true; ui.brief.hidden = true; focusCanvas();
		presentation.resetCamera();
	};
	const order = function (action: () => boolean) {
		if (!available()) return;
		if (!action()) notify(state, 'Order unavailable. Check salvage, capacity, or cooldown.');
		else { syncAudio(); audio.play('order'); }
	};
	const cancelPlacement = function () { placement = undefined; pointers.clear(); multiTouch = false; presentation.cancelInteraction(); };
	const aimPlacement = function (point: Point) {
		if (!available()) return;
		const reason = interdictionReason(state); if (reason) { notify(state, reason); return; }
		pointers.clear(); multiTouch = false; presentation.cancelInteraction();
		placement = { ...point }; rallyMode = false; focusCanvas();
	};
	const confirmPlacement = function () {
		if (!available() || !placement) return;
		const reason = interdictionReason(state, placement); if (reason) { notify(state, reason); return; }
		if (placeInterdiction(state, placement)) { cancelPlacement(); syncAudio(); audio.play('order'); }
	};
	const doBuild = function (weapon: Weapon) { order(function () { return build(state, selected, weapon); }); };
	for (const control of buildButtons) control.addEventListener('click', function () {
		const kind = control.dataset['build']; if (kind === 'flak' || kind === 'rail' || kind === 'missile' || kind === 'beam') doBuild(kind);
	}, options);
	for (const control of deployButtons) control.addEventListener('click', function () {
		const kind = control.dataset['deploy']; if (kind === 'interceptor' || kind === 'guardian') order(function () { return deploy(state, kind); });
	}, options);
	ui.upgrade.addEventListener('click', function () { order(function () { return upgrade(state, selected); }); }, options);
	ui.sell.addEventListener('click', function () { order(function () { return sell(state, selected); }); }, options);
	ui.pulse.addEventListener('click', function () { order(function () { return pulse(state); }); }, options);
	ui.repair.addEventListener('click', function () { order(function () { return repair(state); }); }, options);
	button('repair-sensors').addEventListener('click', function () { order(function () { return repairSensors(state); }); }, options);
	ui.depart.addEventListener('click', function () {
		if (!available() || state.status !== 'fitting') return;
		state.status = 'running'; notify(state, 'Underway. Allocate power and monitor the sensor feed.'); accumulator = 0; focusCanvas();
	}, options);
	button('prepare').addEventListener('click', function () { briefing = false; ui.brief.hidden = true; focusCanvas(); }, options);
	button('prepare').disabled = false;
	for (const control of container.querySelectorAll<HTMLButtonElement>('[data-mode]')) control.addEventListener('click', function () {
		mode = control.dataset['mode'] === 'systems' ? 'systems' : control.dataset['mode'] === 'drill' ? 'drill' : 'voyage'; restart();
	}, options);
	const escortPanel = createEscortPanel(element('escort-orders'), function () { return state; }, available, abort.signal);
	const engineeringPanel = createEngineeringPanel(element('engineering'), function () { return state; }, available, abort.signal);
	const interdictionPanel = createInterdictionPanel(element('interdiction-panel'), function () { return state; }, available, { get: function () { return placement; }, aim: aimPlacement, cancel: cancelPlacement, confirm: confirmPlacement }, abort.signal);
	ui.pause.addEventListener('click', function () { setPause(!paused); }, options);
	button('help').addEventListener('click', function () { setPause(true); }, options);
	button('resume').addEventListener('click', function () { setPause(false); }, options);
	button('restart').addEventListener('click', restart, options); button('restart-pause').addEventListener('click', restart, options);
	ui.speed.addEventListener('click', function () { if (available()) speed = speed === 1 ? 2 : 1; }, options);
	ui.rally.addEventListener('click', function () { if (available()) { cancelPlacement(); rallyMode = !rallyMode; focusCanvas(); } }, options);
	ui.clear.addEventListener('click', function () { if (available()) setPriority(state, undefined); }, options);
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
		if (placement) {
			const point = presentation.placementPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top });
			if (point) { placement = point; notify(state, 'Field preview updated. Enter or Place field confirms; Esc cancels.'); }
			focusCanvas(); return;
		}
		const { mount, enemy, world } = presentation.pick({ x: event.clientX - rect.left, y: event.clientY - rect.top }, state);
		if (mount >= 0 && !rallyMode) selected = mount;
		else if (enemy && !rallyMode) {
			if (setPriority(state, enemy.id)) notify(state, `Priority target: ${contactIntel(state, enemy) === 'classified' ? enemy.kind : 'unclassified contact'}. Eligible weapons in range and coverage will focus fire.`);
			else notify(state, 'Contact outside sensor range. Nearby defense remains automatic.');
		}
		else if (world && !state.experimental && setRally(state, world)) { rallyMode = false; notify(state, 'Escort rally point updated.'); }
		focusCanvas();
	};
	canvas.addEventListener('pointerup', function (event) { releasePointer(event, false); }, options);
	canvas.addEventListener('pointercancel', function (event) { releasePointer(event, true); pointers.clear(); multiTouch = false; presentation.cancelInteraction(); }, options);
	window.addEventListener('pointerup', function (event) { pointers.delete(event.pointerId); if (pointers.size === 0) multiTouch = false; }, options);
	window.addEventListener('keydown', function (event) {
		if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
		if (event.target instanceof HTMLSelectElement) return;
		// Preserve native keyboard activation when navigating DOM controls.
		if (event.code === 'Space' && (event.target instanceof HTMLButtonElement || event.target instanceof HTMLElement && event.target.tagName === 'SUMMARY')) return;
		if (event.code === 'Escape' && placement) { event.preventDefault(); cancelPlacement(); return; }
		if (event.code === 'Escape' || event.code === 'Space') { event.preventDefault(); setPause(!paused); return; }
		if (!available()) return;
		if (event.code === 'KeyI') { event.preventDefault(); if (placement) cancelPlacement(); else aimPlacement(worldPoint(state, { x: 300, y: 0 })); return; }
		if (placement && event.target === canvas) {
			const adjustment = event.code === 'ArrowUp' ? { x: 20, y: 0 } : event.code === 'ArrowDown' ? { x: -20, y: 0 } : event.code === 'ArrowLeft' ? { x: 0, y: -20 } : event.code === 'ArrowRight' ? { x: 0, y: 20 } : undefined;
			if (adjustment) { event.preventDefault(); const offset = worldPoint(state, adjustment); placement = { x: placement.x + offset.x - state.ark.x, y: placement.y + offset.y - state.ark.y }; return; }
			if (event.code === 'Enter') { event.preventDefault(); confirmPlacement(); return; }
		}
		const index = ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8'].indexOf(event.code);
		if (index >= 0) { selected = index; rallyMode = false; cancelPlacement(); event.preventDefault(); }
		if (event.code === 'KeyQ') { event.preventDefault(); order(function () { return pulse(state); }); }
		if (event.code === 'KeyE') { event.preventDefault(); order(function () { return repair(state); }); }
		if (event.code === 'KeyS') { event.preventDefault(); order(function () { return repairSensors(state); }); }
		if (event.code === 'KeyR' && !state.experimental) { event.preventDefault(); cancelPlacement(); rallyMode = !rallyMode; }
	}, options);
	window.addEventListener('blur', function () { pointers.clear(); multiTouch = false; presentation.cancelInteraction(); state.focused = false; audio.setActive(false); rallyMode = false; setPause(true); }, options);
	document.addEventListener('visibilitychange', function () { if (document.hidden) { pointers.clear(); multiTouch = false; presentation.cancelInteraction(); state.focused = false; audio.setActive(false); rallyMode = false; setPause(true); } }, options);
	window.addEventListener('focus', function () { state.focused = true; }, options);
	document.addEventListener('visibilitychange', function () { if (!document.hidden) state.focused = true; }, options);
	const hud = function () {
		if (container.dataset['mode'] !== mode) container.dataset['mode'] = mode;
		const prioritizeEngineering = state.status !== 'fitting';
		if (engineeringFirst !== prioritizeEngineering) {
			engineeringFirst = prioritizeEngineering;
			if (engineeringFirst) ui.depart.after(element('engineering')); else element('interdiction-panel').after(element('engineering'));
		}
		escortPanel(); engineeringPanel(); interdictionPanel(); canvas.classList.toggle('placing-field', !!placement);
		const active = available();
		const systems = state.systems; const energyShield = systems.shield;
		const sensors = systems.sensors; const ranges = sensorRanges(state);
		const sensorMeter = element('sensor-meter');
		if (sensorMeter instanceof HTMLMeterElement) { sensorMeter.max = SENSOR_CONFIG.maxIntegrity; sensorMeter.value = sensors.integrity; }
		label(element('sensor-integrity'), `${Math.ceil(sensors.integrity)} / ${SENSOR_CONFIG.maxIntegrity}`);
		label(element('sensor-status'), sensors.integrity <= 0 ? 'OFFLINE · nearby defense available' : sensors.integrity < SENSOR_CONFIG.healthyThreshold ? 'IMPAIRED · late and uncertain warnings' : 'HEALTHY · advance warning and acquisition');
		label(element('sensor-range'), `Detect ${ranges.detection}m · classify ${ranges.classification}m`);
		const why = !active ? 'Commands held' : sensors.repairCooldown > 0 ? `Repair cooldown · ${Math.ceil(sensors.repairCooldown)}s` : sensors.integrity >= SENSOR_CONFIG.maxIntegrity ? 'Array at full integrity' : state.salvage < SENSOR_CONFIG.repairCost ? `Needs ${SENSOR_CONFIG.repairCost} salvage` : `Restore array · ${SENSOR_CONFIG.repairCost} salvage`;
		button('repair-sensors').disabled = !active || sensors.integrity >= SENSOR_CONFIG.maxIntegrity || sensors.repairCooldown > 0 || state.salvage < SENSOR_CONFIG.repairCost;
		label(element('sensor-repair-info'), why);

		const chargeMeter = element('shield-meter');
		if (chargeMeter instanceof HTMLMeterElement) { chargeMeter.max = energyShield.capacity; chargeMeter.value = energyShield.charge; }
		label(element('shield-charge'), `${Math.ceil(energyShield.charge)} / ${energyShield.capacity}`);
		const held = briefing || paused || !state.focused || state.status !== 'running';
		const recharge = powerOutputs(systems.allocation).shieldRecharge;
		label(element('shield-status'), `${energyShield.charge === 0 ? 'DEPLETED · ' : ''}${held ? 'Recharge held' : energyShield.charge >= energyShield.capacity ? 'Fully charged' : energyShield.rechargeDelay > 0 ? `Recharge in ${Math.ceil(energyShield.rechargeDelay)}s` : recharge > 0 ? `Recharging · +${recharge} / s` : 'Recharge stopped · no shield power'}`);
		label(element('purchase-reason'), !active ? 'Commands held' : craftCount(state) >= 9 ? 'Bay full: nine craft slots' : state.salvage < 85 ? 'Insufficient salvage' : state.experimental ? 'Buy wing 85 · ready in bay / Guardian 105' : 'Deploy escorts'); const mount = state.mounts[selected]; if (!mount) return;
		label(ui.hull, `${Math.ceil(state.hull)} / ${MAX_HULL}`); meter.value = state.hull;
		const journey = journeyFor(state);
		label(ui.salvage, String(Math.floor(state.salvage))); ui.route.style.width = `${journey.progress * 100}%`;
		label(ui.distance, `${Math.floor(journey.progress * 100)}%`);
		label(ui.routeLabel, journey.remaining > 0 ? `KEPLER · ${(journey.remaining / 1000).toFixed(2)} KM` : 'KEPLER · ARRIVED');
		const deadline = state.scenario?.deadline; element('trial-status').hidden = deadline === undefined;
		if (deadline !== undefined) {
			label(element('trial-clock'), `${clockTime(state.time)} / ${clockTime(deadline)} LIMIT`);
			label(element('trial-goal'), state.status === 'won' ? 'ROUTE + CONTACTS COMPLETE' : state.resultReason === 'deadline' ? 'DEADLINE MISSED' : state.resultReason === 'hull' ? 'ARK DESTROYED' : journey.remaining > 0 ? '1.44 KM + CLEAR CONTACTS' : 'GATE REACHED · CLEAR CONTACTS');
			label(element('trial-eta'), journey.eta === Infinity ? 'TRAVEL STALLED' : `TRAVEL ETA ${clockTime(Math.ceil(journey.eta))}`);
			element('trial-status').classList.toggle('urgent', state.status === 'running' && (deadline - state.time < 30 || journey.eta > deadline - state.time));
		}
		label(button('prepare'), mode === 'systems' ? 'PREPARE SYSTEMS TRIAL →' : state.scenario ? 'PREPARE ESCORT DRILL →' : 'PREPARE FULL VOYAGE →');
		const modeName = mode === 'systems' ? 'SYSTEMS TRIAL' : mode === 'drill' ? 'ESCORT DRILL' : 'FULL VOYAGE';
		label(ui.wave, `${modeName} · ${state.status === 'fitting' ? 'FITTING' : 'SENSOR FEED'}`);
		label(ui.waveInfo, contactWarning(state));
		for (const [i, control] of mountButtons.entries()) {
			const m = state.mounts[i]; if (!m) continue;
			label(control, `${i + 1} ${m.weapon ? m.weapon === 'flak' ? 'F' : m.weapon === 'rail' ? 'R' : m.weapon === 'beam' ? 'B' : 'M' : '·'}${m.level > 1 ? ` ${'⁺'.repeat(m.level - 1)}` : ''}`);
			control.classList.toggle('selected', selected === i); control.classList.toggle('fitted', !!m.weapon); control.setAttribute('aria-pressed', String(selected === i)); control.disabled = !active;
			control.setAttribute('aria-label', `Mount ${i + 1}, ${m.weapon ? `${WEAPONS[m.weapon].name} level ${m.level}` : 'empty'}`);
		}
		const position = ['AFT', 'MID AFT', 'MID BOW', 'BOW'][selected % 4] ?? '';
		label(ui.mountTitle, `MOUNT 0${selected + 1} / ${selected < 4 ? 'PORT' : 'STARBOARD'} ${position}`);
		label(ui.mountInfo, mount.weapon ? `${WEAPONS[mount.weapon].name} · Level ${mount.level} / 3 · ${Math.round(WEAPONS[mount.weapon].range * (1 + (mount.level - 1) * 0.12))}m range · ${Math.round(WEAPONS[mount.weapon].rotationSpeed * 180 / Math.PI)}°/s turn` : 'Empty hardpoint');
		label(ui.mountInfo, ui.mountInfo.textContent + (state.coverageDegrees < 360 ? ` · ${state.coverageDegrees}° outward coverage` : ' · full firing arc'));
		ui.build.hidden = !!mount.weapon; ui.upgradeOptions.hidden = !mount.weapon;
		label(ui.upgrade, mount.level >= 3 ? 'FULLY UPGRADED' : `UPGRADE TO LV ${mount.level + 1} · ${upgradeCost(mount)}`);
		ui.upgrade.disabled = !active || mount.level >= 3 || state.salvage < upgradeCost(mount);
		ui.upgrade.title = '+55% base damage, +12% range and firing speed per level';
		label(ui.sell, `Salvage weapon · +${Math.floor(invested(mount) * 0.7)}`); ui.sell.disabled = !active;
		for (const control of buildButtons) { const kind = control.dataset['build']; if (kind === 'flak' || kind === 'rail' || kind === 'missile' || kind === 'beam') { control.disabled = !active || state.salvage < WEAPONS[kind].cost; control.title = WEAPONS[kind].description; } }
		for (const control of deployButtons) {
			const kind = control.dataset['deploy']; if (kind !== 'interceptor' && kind !== 'guardian') continue;
			const reason = !active ? 'Commands held' : craftCount(state) + ESCORTS[kind].count > 9 ? `Needs ${ESCORTS[kind].count} free slots` : state.salvage < ESCORTS[kind].cost ? 'Insufficient salvage' : '';
			control.disabled = !!reason;
			const detail = control.querySelector('small'); if (detail) label(detail, reason || (kind === 'interceptor' ? state.experimental ? 'Buy 3 ready fighters' : '3 fighters · fragile, fast' : '1 gunship · draws enemy fire'));
		}
		label(ui.escorts, `${craftCount(state)} / 9 CRAFT`);
		const canvasHelp = `Tactical view. Click a numbered mount to build. Click an enemy for turret priority. ${state.experimental ? 'Use the escort bay sector buttons to scramble wings and assign guardians.' : 'Click empty space to rally escorts.'} Right-drag or touch-drag to orbit; wheel or pinch to zoom. Use the command panel for keyboard-accessible orders.`;
		if (canvas.getAttribute('aria-label') !== canvasHelp) canvas.setAttribute('aria-label', canvasHelp);
		label(ui.depart, mode === 'systems' ? 'START SYSTEMS TRIAL →' : state.scenario ? 'START ESCORT DRILL →' : 'DEPART FOR KEPLER →');
		label(button('restart-pause'), mode === 'systems' ? 'Restart Systems Trial' : state.scenario ? 'Restart drill' : 'Restart voyage');
		label(button('restart'), mode === 'systems' ? 'RETRY SYSTEMS TRIAL →' : state.scenario ? 'RETRY ESCORT DRILL →' : 'ANOTHER VOYAGE →');
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
		label(ui.hint, placement ? 'FIELD PREVIEW · Tap/click to aim · Enter / Place field to confirm · Esc cancels' : state.experimental ? 'Select a mount for coverage · Click hostile for turret priority · Order escorts in bay' : rallyMode ? 'RALLY MODE · Click or tap a location for all escorts' : state.priority !== undefined ? 'PRIORITY LOCK · Weapons focus the marked hostile when in range' : 'Click mount to build · Click empty space to rally · Click hostile to focus');
		label(ui.message, state.messageTime > 0 ? state.message : ''); label(ui.speed, `${speed}×`); ui.speed.disabled = !active;
		label(ui.pause, paused ? '▶ Resume' : 'Ⅱ Pause'); ui.pause.disabled = briefing || state.status === 'won' || state.status === 'lost';
	};
	const showResult = function () {
		ui.result.hidden = false; rallyMode = false; placement = undefined; pointers.clear(); multiTouch = false; presentation.cancelInteraction();
		label(element('result-title'), mode === 'systems' ? state.status === 'won' ? 'SYSTEMS TRIAL COMPLETE.' : 'SYSTEMS TRIAL LOST.' : state.scenario ? state.status === 'won' ? 'DRILL COMPLETE.' : 'DRILL LOST.' : state.status === 'won' ? 'THE ARK ARRIVES.' : 'THE LIGHTS GO OUT.');
		const summary = systemsSummary(state);
		label(element('result-copy'), systemsResultMessage(state));
		label(element('result-stats'), [
			`${summary.elapsed.toFixed(1)}s elapsed · ${Math.round(summary.distance)} / ${summary.routeLength}m · travel ETA ${summary.eta === null ? 'stalled' : clockTime(Math.ceil(summary.eta))}`,
			`Hull ${Math.ceil(summary.hull)} / ${MAX_HULL} · shield ${Math.ceil(summary.shield)} / ${state.systems.shield.capacity}`,
			`${Math.round(summary.shieldAbsorbed)} shield damage absorbed · ${summary.powerChanges} power changes`,
			`${summary.contacts} / ${summary.totalContacts} contact groups arrived · ${summary.kills} hostiles destroyed`,
			`Sensors: ${summary.sensorImpairments} impairments · ${summary.sensorRepairs} repairs`,
			`Fields: ${summary.fieldPlacements} placed · ${summary.redirected} approaches redirected`,
			`${summary.escortLosses} escorts lost · ${Math.floor(summary.salvage)} salvage remaining`,
		].join('\n'));
		ui.result.scrollTop = 0;
		button('restart').focus({ preventScroll: true });
	};
	const tick = function (now: number) {
		if (disposed) return;
		const elapsed = previous ? Math.min(0.1, (now - previous) / 1000) : 0; previous = now;
		if (available() && state.status === 'running' && !document.hidden) {
			accumulator += elapsed * speed;
			while (accumulator >= 1 / 60 && state.status === 'running') { step(state, 1 / 60); syncAudio(); accumulator -= 1 / 60; if (state.status !== 'running') showResult(); }
		} else accumulator = 0;
		if (contextAvailable) presentation.render(state, selected, reducedMotion.matches, rallyMode, !briefing && !paused && (state.status === 'fitting' || state.status === 'running'), placement);
		syncAudio(); hud();
		frame = requestAnimationFrame(tick);
	};
	frame = requestAnimationFrame(tick);
	return function () { disposed = true; cancelAnimationFrame(frame); abort.abort(); detachFullscreen(); pointers.clear(); presentation.dispose(); void audio.dispose(); };
});
if (import.meta.hot) import.meta.hot.dispose(shutdown);
