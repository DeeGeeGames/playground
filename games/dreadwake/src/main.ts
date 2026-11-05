import { mountGame } from '../../../shared/lifecycle';
import { createCampaignState, CAMPAIGN_MISSIONS, REFIT_CHOICES, chooseRefit, cycleTarget, designateTarget, distance, MAX_HULL, RELOAD, SHIELD_COOLDOWN, TORPEDO_RELOAD, step, targetFor, torpedoTargetFor, type Controls } from './simulation';
import { createRenderer } from './render';
import { cameraFor, pickShip, screenToWorld, zoomForWheel } from './projection';
import { createAudio } from './audio';
import { readCampaign, writeCampaign, clearCampaign } from './campaign-save';

const element = function (id: string): HTMLElement {
	const value = document.getElementById(id);
	if (!(value instanceof HTMLElement)) throw new Error(`Missing bridge element: ${id}`);
	return value;
};
const bindings = new Map([
	['KeyW', 'forward'], ['ArrowUp', 'forward'], ['KeyS', 'back'], ['ArrowDown', 'back'],
	['KeyA', 'left'], ['ArrowLeft', 'left'], ['KeyD', 'right'], ['ArrowRight', 'right'],
	['KeyX', 'neutral'], ['KeyQ', 'port'], ['KeyE', 'starboard'], ['Space', 'brace'], ['KeyF', 'pulse'],
	['KeyT', 'torpedo'], ['KeyG', 'autoFire'],
]);
const shutdown = await mountGame('game', async function (container) {
	const canvas = container.querySelector('canvas'); if (!canvas) throw new Error('Missing battlefield');
	const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas 2D unavailable');
	const ui = {
		brief: element('brief'), pausePanel: element('pause-panel'), result: element('result'), pause: element('pause'),
		phase: element('phase'), objective: element('objective'), hull: element('hull-value'), hullFill: element('hull-fill'),
		throttle: element('throttle-value'), throttleFill: element('throttle-fill'), speed: element('speed-value'), motion: element('motion'),
		message: element('message'), sound: element('sound'), brace: element('brace'),
		pulse: element('pulse'), pulseState: element('pulse-state'), pulseFill: element('pulse-fill'), shield: element('shield-readout'),
		targetName: element('target-name'), targetInfo: element('target-info'), cycle: element('cycle-target'), clear: element('clear-target'),
		torpedo: element('torpedo'), torpedoState: element('torpedo-state'), torpedoFill: element('torpedo-fill'), torpedoTarget: element('torpedo-target'),
		autoFire: element('auto-fire'), autoState: element('auto-state'), defenseState: element('defense-state'), defenseCount: element('defense-count'),
	};
	const render = createRenderer();
	const audio = createAudio(); const abort = new AbortController(); const options = { signal: abort.signal };
	const keys = new Set<string>(); const pending = new Set<string>(); const pointers = new Map<number, string>();
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-action]')];
	const batteryUi = {
		port: { label: element('port-state'), fill: element('port-fill'), target: element('port-target') },
		starboard: { label: element('starboard-state'), fill: element('starboard-fill'), target: element('starboard-target') },
	};
	let heading: number | undefined;
	let state = createCampaignState(); let running = false; let paused = false; let muted = false;
	let confirmingRestart = false; let restartSource: HTMLElement = element('start');
	const loadedCampaign = readCampaign();
	let savedCampaign = loadedCampaign.status === 'saved' ? loadedCampaign.state : undefined;
	const setSaveStatus = function (message: string, failed = false) {
		for (const status of container.querySelectorAll<HTMLElement>('[data-save-status]')) { status.textContent = message; status.dataset['failed'] = String(failed); }
		const notice = element('save-notice'); notice.hidden = !failed; notice.textContent = failed ? message : '';
	};
	const saveCheckpoint = function () {
		if (writeCampaign(state)) {
			savedCampaign = state;
			setSaveStatus(state.campaign?.phase === 'refit' ? 'Refit checkpoint saved in this browser. You can return to this choice later.' : 'Mission-start checkpoint saved in this browser. Continue restarts this mission.');
		} else setSaveStatus('Could not save in this browser. Keep this page open to preserve your run.', true);
	};
	if (savedCampaign) {
		element('continue-campaign').hidden = false;
		element('start').textContent = 'START A NEW CAMPAIGN ↗';
		element('continue-summary').textContent = `${CAMPAIGN_MISSIONS[savedCampaign.wave - 1]?.name ?? 'Lyra Passage'} · ${savedCampaign.campaign?.phase === 'refit' ? 'refit checkpoint' : 'mission-start checkpoint'} · ${Math.ceil(savedCampaign.player.hp / savedCampaign.player.maxHp * 100)}% hull`;
		setSaveStatus('Saved locally in this browser. Mission-start checkpoints replay the mission.');
	} else if (loadedCampaign.status === 'unavailable') setSaveStatus('Browser storage is unavailable. Your campaign can only last while this page stays open.', true);
	else if (loadedCampaign.status === 'invalid') setSaveStatus('The previous checkpoint could not be read. Start a new campaign to replace it.', true);
	else setSaveStatus('Progress saves in this browser at mission starts and field refits.');
	let frame = 0; let previous = 0; let accumulator = 0; let zoom = 1;
	const clearInput = function () {
		heading = undefined; keys.clear(); pending.clear(); state.shield.held = false; state.torpedoes.held = false; state.fireControl.held = false;
		for (const button of buttons) for (const id of pointers.keys()) if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
		pointers.clear();
	};
	const active = function (action: string) { return [...keys].some(function (code) { return bindings.get(code) === action; }) || pending.has(action) || [...pointers.values()].includes(action); };
	const playable = function () { return running && !paused && !confirmingRestart && state.outcome === 'playing' && state.campaign?.phase !== 'refit'; };
	let refitChoice: typeof REFIT_CHOICES[number]['id'] | undefined;
	const totalShips = CAMPAIGN_MISSIONS.reduce(function (total, mission) { return total + mission.enemies.length; }, 0);
	const route = element('campaign-route');
	for (const [index, mission] of CAMPAIGN_MISSIONS.entries()) {
		const item = document.createElement('li');
		const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2, '0');
		const details = document.createElement('div');
		const name = document.createElement('strong'); name.textContent = mission.name;
		const location = document.createElement('small'); location.textContent = mission.location;
		details.append(name, location); item.append(number, details); route.append(item);
		element('mission-steps').append(document.createElement('i'));
	}
	element('mission-count').textContent = String(CAMPAIGN_MISSIONS.length).padStart(2, '0');
	const unlock = function () {
		void audio.unlock().then(function (available) { if (!available) ui.sound.textContent = 'Audio unavailable'; });
	};
	const syncPanels = function () {
		container.dataset['mode'] = running ? 'playing' : 'briefing';
		ui.brief.hidden = running || confirmingRestart; ui.pausePanel.hidden = !paused || confirmingRestart; ui.result.hidden = !running || state.outcome === 'playing' || confirmingRestart;
		element('confirm-reset').hidden = !confirmingRestart;
		element('refit').hidden = !running || state.campaign?.phase !== 'refit' || state.outcome !== 'playing' || confirmingRestart;
		const modal = [...container.querySelectorAll<HTMLElement>('.overlay')].find(function (panel) { return !panel.hidden; });
		for (const child of container.children) if (child instanceof HTMLElement) child.inert = !!modal && child !== modal;
		ui.pause.textContent = paused ? 'Resume · Esc' : 'Pause · Esc';
		if (ui.pause instanceof HTMLButtonElement) ui.pause.disabled = !running || state.outcome !== 'playing' || state.campaign?.phase === 'refit';
		for (const button of buttons) button.disabled = !playable();
		for (const control of [ui.cycle, ui.clear]) if (control instanceof HTMLButtonElement) control.disabled = !playable();
	};
	const start = function () {
		state = createCampaignState(); running = true; paused = false; confirmingRestart = false; accumulator = 0; zoom = 1; clearInput(); saveCheckpoint(); syncPanels(); canvas.focus({ preventScroll: true }); unlock();
	};
	const pause = function (value: boolean) {
		if (!running || confirmingRestart || state.outcome !== 'playing' || state.campaign?.phase === 'refit') return;
		paused = value; clearInput(); accumulator = 0; syncPanels();
		if (paused) { audio.update(0, false, []); element('resume').focus({ preventScroll: true }); }
		else { canvas.focus({ preventScroll: true }); unlock(); }
	};
	const showRefit = function () {
		clearInput(); accumulator = 0; refitChoice = undefined; audio.update(0, false, []);
		const nextMission = CAMPAIGN_MISSIONS[state.wave];
		element('refit-summary').textContent = `${CAMPAIGN_MISSIONS[state.wave - 1]?.name ?? 'Mission'} secured. Hull ${Math.ceil(state.player.hp / state.player.maxHp * 100)}%. Rail upgrades ${state.campaign?.upgrades.rails ?? 0} · capacitor upgrades ${state.campaign?.upgrades.capacitor ?? 0}.`;
		element('next-mission-number').textContent = `NEXT / MISSION ${String(state.wave + 1).padStart(2, '0')}`;
		element('next-mission-title').textContent = nextMission?.name ?? 'Passage secured';
		element('next-mission-intel').textContent = nextMission?.briefing ?? '';
		const choices = element('refit-choices'); choices.replaceChildren();
		for (const choice of REFIT_CHOICES) {
			const label = document.createElement('label'); label.className = 'refit-choice';
			const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'refit-choice'; radio.value = choice.id;
			const details = document.createElement('span'); const name = document.createElement('strong'); const description = document.createElement('small');
			name.textContent = choice.name; description.textContent = choice.description;
			if (choice.id === 'repair') description.textContent += ` Hull after repairs: ${Math.ceil(Math.min(state.player.maxHp, state.player.hp + state.player.maxHp * 0.35) / state.player.maxHp * 100)}%.`;
			details.append(name, description); label.append(radio, details); choices.append(label);
			radio.addEventListener('change', function () {
				refitChoice = choice.id;
				const deploy = element('deploy'); if (deploy instanceof HTMLButtonElement) deploy.disabled = false;
				deploy.textContent = `COMMIT ${choice.name.toUpperCase()} & DEPLOY ↗`;
			}, options);
		}
		const deploy = element('deploy'); if (deploy instanceof HTMLButtonElement) deploy.disabled = true;
		deploy.textContent = 'SELECT A REFIT TO CONTINUE ↗';
		syncPanels(); choices.querySelector('input')?.focus({ preventScroll: true });
	};
	element('deploy').addEventListener('click', function () {
		if (!refitChoice || !chooseRefit(state, refitChoice)) return;
		clearInput(); accumulator = 0; saveCheckpoint(); syncPanels(); canvas.focus({ preventScroll: true }); unlock();
	}, options);
	const cancelRestart = function () { confirmingRestart = false; syncPanels(); restartSource.focus({ preventScroll: true }); };
	for (const id of ['start', 'restart', 'reset']) element(id).addEventListener('click', function () {
		if (!savedCampaign && !(running && state.outcome === 'playing')) { start(); return; }
		restartSource = element(id); confirmingRestart = true; clearInput(); syncPanels(); element('cancel-reset').focus({ preventScroll: true });
	}, options);
	element('cancel-reset').addEventListener('click', cancelRestart, options);
	element('confirm-start').addEventListener('click', start, options);
	element('continue').addEventListener('click', function () {
		if (!savedCampaign) return;
		state = savedCampaign; running = true; paused = false; accumulator = 0; zoom = 1; clearInput();
		if (state.campaign?.phase === 'refit') showRefit();
		else { syncPanels(); canvas.focus({ preventScroll: true }); unlock(); }
		setSaveStatus(state.campaign?.phase === 'refit' ? 'Resumed the saved refit. Choose your next upgrade or repair.' : 'Resumed the mission-start checkpoint. Your next checkpoint is after this engagement.');
	}, options);
	element('resume').addEventListener('click', function () { pause(false); }, options);
	ui.pause.addEventListener('click', function () { pause(!paused); }, options);
	const soundButtons = [ui.sound];
	for (const panel of container.querySelectorAll('.overlay .panel')) {
		const utilities = document.createElement('div'); utilities.className = 'modal-utilities';
		const sound = document.createElement('button'); sound.type = 'button'; sound.textContent = 'Sound on'; sound.setAttribute('aria-pressed', 'false'); sound.setAttribute('aria-label', 'Mute sound');
		soundButtons.push(sound); utilities.append(sound);
		if (!panel.querySelector('a[href]')) { const back = document.createElement('a'); back.href = '../../'; back.textContent = 'Return to experiments'; utilities.append(back); }
		panel.append(utilities);
	}
	const toggleSound = function () {
		muted = !muted; audio.setMuted(muted);
		for (const sound of soundButtons) { sound.textContent = muted ? 'Sound off' : 'Sound on'; sound.setAttribute('aria-pressed', String(muted)); sound.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound'); }
		if (!muted) unlock();
		if (playable()) canvas.focus({ preventScroll: true });
	};
	for (const sound of soundButtons) sound.addEventListener('click', toggleSound, options);
	window.addEventListener('keydown', function (event) {
		if (event.code === 'Tab') {
			const modal = [...container.querySelectorAll<HTMLElement>('.overlay')].find(function (panel) { return !panel.hidden; });
			if (modal) {
				const candidates = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)')].filter(function (candidate) { return !candidate.closest('[hidden]'); });
				const focusable = candidates.filter(function (candidate) {
					if (!(candidate instanceof HTMLInputElement) || candidate.type !== 'radio') return true;
					const group = candidates.filter(function (item): item is HTMLInputElement { return item instanceof HTMLInputElement && item.type === 'radio' && item.name === candidate.name; });
					return candidate === (group.find(function (item) { return item.checked; }) ?? group[0]);
				});
				const first = focusable[0]; const last = focusable.at(-1);
				if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
				else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
			}
		}
		if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) { if (confirmingRestart) cancelRestart(); else pause(!paused); } return; }
		if (event.code === 'KeyR' && playable()) { if (!event.repeat) cycleTarget(state); event.preventDefault(); return; }
		const action = bindings.get(event.code); if (!action || !playable()) return;
		if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
		event.preventDefault(); keys.add(event.code); if (!event.repeat) pending.add(action);
	}, options);
	window.addEventListener('keyup', function (event) { keys.delete(event.code); }, options);
	window.addEventListener('blur', function () { clearInput(); pause(true); }, options);
	document.addEventListener('visibilitychange', function () { if (document.hidden) { clearInput(); pause(true); } }, options);
	const release = function (event: PointerEvent) { pointers.delete(event.pointerId); };
	window.addEventListener('pointerup', release, options); window.addEventListener('pointercancel', release, options);
	for (const button of buttons) {
		button.addEventListener('pointerdown', function (event) {
			const action = button.dataset['action']; if (!action || !playable() || event.button !== 0) return;
			event.preventDefault(); button.setPointerCapture(event.pointerId); pointers.set(event.pointerId, action); pending.add(action);
		}, options);
		button.addEventListener('lostpointercapture', release, options);
		button.addEventListener('click', function (event) {
			const action = button.dataset['action']; if (event.detail === 0 && action && playable()) pending.add(action);
		}, options);
	}
	ui.cycle.addEventListener('click', function () { if (playable()) { cycleTarget(state); canvas.focus({ preventScroll: true }); } }, options);
	ui.clear.addEventListener('click', function () { if (playable()) { designateTarget(state, undefined); canvas.focus({ preventScroll: true }); } }, options);
	canvas.addEventListener('wheel', function (event) {
		if (!playable() || event.ctrlKey || event.metaKey) return;
		event.preventDefault();
		zoom = zoomForWheel(zoom, event, canvas.getBoundingClientRect().height);
	}, { ...options, passive: false });
	canvas.addEventListener('contextmenu', function (event) {
		if (playable()) event.preventDefault();
	}, options);
	canvas.addEventListener('pointerdown', function (event) {
		if (!playable() || (event.button !== 0 && event.button !== 2)) return;
		const rect = canvas.getBoundingClientRect();
		const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
		const camera = cameraFor(rect.width, rect.height, state.player, zoom);
		if (event.button === 2 && event.pointerType === 'mouse') {
			event.preventDefault();
			const world = screenToWorld(point, camera, 20);
			if (distance(world, state.player) > 1) heading = Math.atan2(world.y - state.player.y, world.x - state.player.x);
		} else if (event.button === 0) {
			const target = pickShip(point, camera, state.enemies);
			designateTarget(state, target?.id);
		}
		canvas.focus({ preventScroll: true });
	}, options);
	const hud = function () {
		const p = state.player; const speed = Math.hypot(p.vx, p.vy);
		const priority = state.enemies.find(function (enemy) { return enemy.id === state.priorityTarget; });
		ui.targetName.textContent = priority ? `${priority.kind.toUpperCase()} ${String(priority.id).padStart(2, '0')}` : 'AUTO ACQUISITION';
		ui.targetInfo.textContent = priority ? `${Math.round(distance(p, priority))} M / ${Math.ceil(priority.hp / priority.maxHp * 100)}% HULL` : 'Click a hostile or cycle targets';
		ui.shield.textContent = state.shield.active > 0 ? `${state.shield.active.toFixed(1)} S ACTIVE` : state.shield.cooldown > 0 ? `${state.shield.cooldown.toFixed(0)} S` : 'CHARGED';
		ui.pulseState.textContent = state.shield.active > 0 ? `FIELD ACTIVE / ${state.shield.active.toFixed(1)} S` : state.shield.cooldown > 0 ? `CHARGING / ${state.shield.cooldown.toFixed(1)} S` : 'READY · 3 SEC / −85% DAMAGE';
		ui.pulseFill.style.width = `${(1 - state.shield.cooldown / Math.max(6, SHIELD_COOLDOWN - (state.campaign?.upgrades.capacitor ?? 0) * 3)) * 100}%`;
		ui.pulse.classList.toggle('cooling', state.shield.cooldown > 0);
		const torpedoTarget = torpedoTargetFor(state); const rack = state.torpedoes;
		ui.torpedoState.textContent = rack.remaining > 0 ? 'LAUNCHING' : rack.reload > 0 ? `${rack.reload.toFixed(1)} S` : p.braced ? 'LOCKED' : torpedoTarget ? 'READY' : 'NO LOCK';
		ui.torpedoTarget.textContent = torpedoTarget ? `BOW LOCK / ${torpedoTarget.kind.toUpperCase()} ${String(torpedoTarget.id).padStart(2, '0')}` : 'ALIGN BOW / 1,000 M';
		ui.torpedoFill.style.width = `${(1 - rack.reload / TORPEDO_RELOAD) * 100}%`;
		ui.torpedo.classList.toggle('locked', !!torpedoTarget);
		ui.autoState.textContent = state.fireControl.automatic ? p.braced ? 'AUTO / ARMOR LOCK' : 'AUTO / VALID ARCS' : 'MANUAL / HOLD Q + E';
		ui.autoFire.setAttribute('aria-pressed', String(state.fireControl.automatic));
		ui.defenseState.textContent = state.pointDefense.reload > 0 ? 'INTERCEPTING' : 'SCANNING';
		ui.defenseCount.textContent = `${state.stats.interceptions} ROUNDS STOPPED`;
		for (const [i, marker] of [...container.querySelectorAll('.mission-steps i')].entries()) {
			marker.classList.toggle('active', i + 1 === state.wave); marker.classList.toggle('complete', i + 1 < state.wave);
		}
		ui.phase.textContent = paused ? 'CAMPAIGN PAUSED' : `MISSION ${String(state.wave).padStart(2, '0')} / ${String(CAMPAIGN_MISSIONS.length).padStart(2, '0')} · ${CAMPAIGN_MISSIONS[state.wave - 1]?.name.toUpperCase() ?? ''}`;
		ui.objective.textContent = state.intermission > 0 ? state.wave === CAMPAIGN_MISSIONS.length ? 'Final contact clear. Securing the passage.' : 'Contact clear. Preparing field refit.' : `${state.enemies.length} hostile signatures · ${state.kills} / ${totalShips} ships broken`;
		ui.hull.textContent = String(Math.ceil(p.hp / MAX_HULL * 100)); ui.hullFill.style.width = `${p.hp / MAX_HULL * 100}%`;
		ui.hullFill.style.background = p.hp < MAX_HULL * 0.3 ? '#e8987e' : '#90e8ec';
		ui.throttle.textContent = Math.abs(p.throttle) < 0.001 ? 'NEUTRAL' : p.throttle < 0 ? `ASTERN ${Math.round(-p.throttle / 0.35 * 100)}%` : `AHEAD ${Math.round(p.throttle * 100)}%`;
		ui.throttleFill.style.width = `${Math.abs(p.throttle) / (p.throttle < 0 ? 0.35 : 1) * 100}%`; ui.throttleFill.style.background = p.throttle < 0 ? '#dfac86' : '#90e8ec';
		ui.speed.textContent = `${Math.round(p.vx * Math.cos(p.angle) + p.vy * Math.sin(p.angle))} M/S`;
		ui.motion.textContent = `${speed < 1 ? 'DRIVE IDLE' : 'UNDER THRUST'} / ${Math.abs(p.yaw) < 0.015 ? 'THRUSTERS CENTERED' : `${p.yaw < 0 ? 'PORT' : 'STBD'} ${Math.abs(p.yaw * 180 / Math.PI).toFixed(0)}°/S`}`;
		for (const side of ['port', 'starboard'] as const) {
			const battery = state.batteries[side]; const items = batteryUi[side]; const target = targetFor(state, side);
			items.label.textContent = battery.remaining > 0 ? 'FIRING' : battery.reload > 0 ? `${battery.reload.toFixed(1)} S` : p.braced ? 'LOCKED' : 'READY';
			items.fill.style.width = `${(1 - battery.reload / RELOAD) * 100}%`;
			items.target.textContent = target ? `SOLUTION / ${target.kind.toUpperCase()} ${String(target.id).padStart(2, '0')}` : 'NO SOLUTION / ALIGN SIDE ARC';
			items.label.closest('button')?.classList.toggle('locked', !!target);
			items.label.closest('button')?.classList.toggle('reloading', battery.reload > 0);
		}
		for (const button of buttons) button.classList.toggle('pressed', playable() && active(button.dataset['action'] ?? ''));
		ui.brace.classList.toggle('pressed', playable() && p.braced);
		ui.pulse.classList.toggle('pressed', playable() && state.shield.active > 0);
		ui.autoFire.classList.toggle('pressed', state.fireControl.automatic);
		ui.message.textContent = !playable() ? '' : state.intermission > 0 ? state.wave === CAMPAIGN_MISSIONS.length ? 'FINAL CONTACT CLEAR / SECURING THE PASSAGE' : `CONTACT CLEAR / FIELD REFIT IN ${Math.max(0, Math.ceil(6 - state.intermission))} S` : state.shield.active > 0 ? 'AEGIS FIELD ACTIVE / 85% DAMAGE REDUCTION' : p.braced ? 'ARMOR LOCK / NEW SALVOS LOCKED / RELOAD SLOWED' : state.enemies.some(function (enemy) { return enemy.warning > 0; }) ? 'INCOMING VOLLEY / EVADE, LOCK ARMOR OR PULSE SHIELDS' : state.time < 12 ? 'Q/E BROADSIDES · G AUTO CREWS · T BOW TORPEDOES' : '';
	};
	const showResult = function () {
		savedCampaign = undefined;
		if (clearCampaign()) setSaveStatus('Campaign ended. The saved checkpoint has been cleared.');
		else setSaveStatus('Campaign ended, but the old checkpoint could not be cleared from this browser.', true);
		clearInput(); syncPanels(); audio.update(0, false, []);
		element('result-title').textContent = state.outcome === 'won' ? 'BLOCKADE BROKEN.' : 'SIGNAL LOST.';
		element('result-copy').textContent = state.outcome === 'won' ? `All ${CAMPAIGN_MISSIONS.length} missions complete. The blockade commander is gone. Your cruiser leaves the Lyra Passage with ${Math.ceil(state.player.hp / state.player.maxHp * 100)}% hull.` : `Lost during ${CAMPAIGN_MISSIONS[state.wave - 1]?.name ?? 'the engagement'}. ${state.campaign?.completedMissions ?? 0} of ${CAMPAIGN_MISSIONS.length} missions secured. Change heading when hostile volleys are marked, and consider repairs before the next engagement.`;
		element('result-stats').textContent = `${state.kills} / ${totalShips} ships broken · ${Math.floor(state.time / 60)}m ${Math.floor(state.time % 60)}s · ${state.stats.salvos} broadsides · ${state.stats.torpedoSalvos} torpedo salvos · ${state.stats.interceptions} rounds intercepted · ${Math.round(state.stats.damageBlocked)} damage prevented by armor / shields`;
		element('restart').focus({ preventScroll: true });
	};
	const tick = function (now: number) {
		const elapsed = previous ? Math.min((now - previous) / 1000, 0.1) : 0; previous = now;
		if (playable() && !document.hidden) {
			accumulator += elapsed;
			while (accumulator >= 1 / 60 && playable()) {
				if (active('right') || active('left')) heading = undefined;
				const input: Controls = { drive: Number(active('forward')) - Number(active('back')), turn: Number(active('right')) - Number(active('left')),
					...(heading === undefined ? {} : { heading }), neutral: active('neutral'), port: active('port'), starboard: active('starboard'), brace: active('brace'),
					pulse: pending.has('pulse'), torpedo: pending.has('torpedo'), autoFire: pending.has('autoFire') };
				step(state, input, 1 / 60); pending.clear(); accumulator -= 1 / 60;
				audio.update(Math.hypot(state.player.vx, state.player.vy), true, state.events);
				if (state.outcome !== 'playing') showResult();
				else if (state.campaign?.phase === 'refit') { saveCheckpoint(); showRefit(); }
			}
		}
		const { width, height } = canvas.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio, 2);
		if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0); render(ctx, width, height, state, reducedMotion.matches, !running, zoom, heading); hud();
		frame = requestAnimationFrame(tick);
	};
	syncPanels(); element(savedCampaign ? 'continue' : 'start').focus({ preventScroll: true }); frame = requestAnimationFrame(tick);
	return async function () { cancelAnimationFrame(frame); clearInput(); abort.abort(); await audio.dispose(); };
});
if (import.meta.hot) import.meta.hot.dispose(shutdown);
